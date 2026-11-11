from typing import Callable, List, Optional, Tuple, Union
from enum import Enum
from threading import BoundedSemaphore
from time import time

from scrapfly import ResponseBodyHandler
from scrapfly.api_response import MAX_DECOMPRESSED_SIZE
from scrapfly.errors import WebhookSignatureMissMatch
import logging

logger = logging.getLogger(__name__)


class ResourceType(Enum):
    """
    Values Scrapfly sends in `X-Scrapfly-Webhook-Resource-Type`.

    ALERT is signed over `<timestamp>.<body>` rather than over the body, and so
    is verified through a separate path.
    """

    SCRAPE = 'scrape'
    PING = 'ping'
    CRAWL = 'crawl'
    EXTRACTION = 'extraction'
    SCREENSHOT = 'screenshot'
    ALERT = 'alert'


# Replay window for alert webhooks, applied either side of now to tolerate clock skew.
ALERT_TIMESTAMP_TOLERANCE = 300

# How long a delivery waits for a decode slot before a 503 the sender retries.
DECODE_WAIT_SECONDS = 30


def _alert_signed_message(
    timestamp: Optional[str],
    body: bytes,
    tolerance: int = ALERT_TIMESTAMP_TOLERANCE,
) -> Optional[bytes]:
    """
    Rebuild the `<timestamp>.<body>` message an alert webhook is signed over, or
    return None when the timestamp is absent, unparseable, or outside the replay
    window.
    """
    if not timestamp:
        return None

    try:
        sent_at = int(timestamp)
    except ValueError:
        return None

    if abs(time() - sent_at) > tolerance:
        return None

    return timestamp.encode('utf-8') + b'.' + body


SigningSecrets = Union[str, Tuple[str, ...], List[str]]


def _normalize_signing_secrets(signing_secrets: SigningSecrets) -> Tuple[str, ...]:
    """
    Normalize the configured secrets to a non-empty tuple.

    A bare string is one secret, not an iterable of single-character keys. A
    tuple or list holds the secrets of a rotation: Scrapfly signs with either
    the old or the new key while they are both listed in the dashboard, so both
    have to be accepted until the old one is retired.
    """
    if not signing_secrets:
        raise ValueError('create_server requires the webhook signing secret(s) from your Scrapfly dashboard')

    if isinstance(signing_secrets, str):
        return (signing_secrets,)

    try:
        secrets = tuple(signing_secrets)
    except TypeError:
        raise ValueError('signing_secrets must be a string or a tuple/list of strings')

    if not secrets:
        raise ValueError('create_server requires the webhook signing secret(s) from your Scrapfly dashboard')

    return secrets


def create_server(
    signing_secrets: SigningSecrets,
    callback: Callable,
    app: Optional['flask.Flask'] = None,
    max_body_size: int = MAX_DECOMPRESSED_SIZE,
    max_concurrent_decodes: int = 2,
) -> 'flask.Flask':
    """
    Serve Scrapfly webhooks on POST /webhook and hand each verified body to
    `callback(data, resource_type, request)`.

    Every request must be signed. A body with no `X-Scrapfly-Webhook-Signature`
    is answered with 401 rather than delivered.

    :param signing_secrets: signing secret(s) from your webhook settings: one string,
        or a tuple/list of strings. During a key rotation both the old and the new
        secret are listed in the dashboard; a request signed with either is accepted.
    :param callback: receives the verified body, its resource type, and the request.
    :param app: optional Flask app to mount the route on.
    :param max_body_size: reject bodies larger than this, before and after decompression.
    :param max_concurrent_decodes: bodies decoded at once. A body is decoded before its
        signature is checked, so each can cost max_body_size to any sender.
    """
    signing_secrets = _normalize_signing_secrets(signing_secrets)

    try:
        import flask
    except ImportError:
        raise ImportError("flask is not installed, please install it with `pip install \"scrapfly-sdk[webhook-server]\"`")

    from flask import request, make_response

    if app is None:
        app = flask.Flask("Scrapfly Webhook Server")

    app.config['MAX_CONTENT_LENGTH'] = max_body_size

    body_handler = ResponseBodyHandler(signing_secrets=signing_secrets)
    decode_slots = BoundedSemaphore(max_concurrent_decodes)
    supported_resource_types = tuple(resource_type.value for resource_type in ResourceType)

    @app.route("/webhook", methods=["POST"])
    def webhook():
        headers = request.headers
        resource_type = headers.get('X-Scrapfly-Webhook-Resource-Type')
        # The digest is sent under both spellings; accept either.
        signature = headers.get('X-Scrapfly-Webhook-Signature') or headers.get('X-Scrapfly-Webhook-Signature-Lowercase')

        if resource_type not in supported_resource_types:
            logger.error("Unsupported resource type: %r", resource_type)
            return make_response("unsupported resource type", 400)

        # A ping sent while a webhook is being created carries no signature. Answer
        # the reachability probe, but never hand an unverified body to the callback:
        # the resource type is as unauthenticated as the signature.
        if resource_type == ResourceType.PING.value and signature is None:
            return make_response("", 200)

        signature_message = None

        if resource_type == ResourceType.ALERT.value:
            signature_message = _alert_signed_message(headers.get('X-Scrapfly-Webhook-Timestamp'), request.get_data())

            if signature_message is None:
                logger.warning("Rejected alert webhook with a missing or stale timestamp from %s", request.remote_addr)
                return make_response("", 401)

        if not decode_slots.acquire(timeout=DECODE_WAIT_SECONDS):
            logger.warning("Deferred %s webhook from %s: %d bodies already decoding", resource_type, request.remote_addr, max_concurrent_decodes)
            return make_response("", 503)

        try:
            data = body_handler.read(
                content=request.get_data(),
                content_encoding=headers.get('Content-Encoding'),
                content_type=headers.get('Content-Type'),
                signature=signature,
                max_decompressed_size=max_body_size,
                signature_message=signature_message,
            )
        except WebhookSignatureMissMatch:
            logger.warning("Rejected unsigned or mis-signed %s webhook from %s", resource_type, request.remote_addr)
            return make_response("", 401)
        except Exception:
            # Decoding runs before verification, so its failures are reachable unauthenticated.
            logger.exception("Rejected undecodable %s webhook from %s", resource_type, request.remote_addr)
            return make_response("", 400)
        finally:
            decode_slots.release()

        try:
            callback(data, resource_type, request)
            return make_response("", 200)
        except Exception:
            logger.exception("Webhook callback failed for %s", resource_type)
            return make_response("", 500)

    return app
