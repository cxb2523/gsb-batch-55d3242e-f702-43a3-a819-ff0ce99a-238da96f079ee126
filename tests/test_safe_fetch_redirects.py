"""Per-hop redirect revalidation in ``safe_fetch.fetch_image``.

The SSRF guard only holds if *every* redirect hop is validated again before
a request is made to it. These tests fake DNS and HTTP so the whole chain is
observable: every ``getaddrinfo`` call and every HTTP request is recorded,
and a rejected hop must never appear in the request log. No real network is
touched.
"""

import ipaddress
import socket

import pytest

import safe_fetch


PUBLIC_IP = "93.184.216.34"
PUBLIC_IP_2 = "93.184.216.35"
PUBLIC_IP_3 = "93.184.216.36"
PRIVATE_IP = "10.0.0.5"


class FakeResponse:
    def __init__(self, status_code=200, headers=None, chunks=()):
        self.status_code = status_code
        self.headers = headers or {}
        self.chunks = list(chunks)
        self.closed = False

    def iter_content(self, chunk_size):
        yield from self.chunks

    def raise_for_status(self):
        if self.status_code >= 400:
            raise safe_fetch.requests.HTTPError(f"{self.status_code} error")

    def close(self):
        self.closed = True


class ChainRecorder:
    """Fake DNS and HTTP layers that record every lookup and request."""

    def __init__(self, monkeypatch, dns, responses):
        self.responses = list(responses)
        self.dns_calls = []
        self.http_calls = []

        def fake_getaddrinfo(host, port, type=None):
            self.dns_calls.append(host)
            if host in dns:
                addresses = dns[host]
            else:
                # IP literals resolve to themselves, like the real resolver.
                try:
                    addresses = [str(ipaddress.ip_address(host))]
                except ValueError:
                    raise socket.gaierror(f"unknown host {host}")
            return [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 0))
                for address in addresses
            ]

        def fake_get(url, **kwargs):
            self.http_calls.append(url)
            assert self.responses, f"unexpected request to {url}"
            return self.responses.pop(0)

        monkeypatch.setattr(safe_fetch.socket, "getaddrinfo", fake_getaddrinfo)
        monkeypatch.setattr(safe_fetch.requests, "get", fake_get)


def _redirect(location, status=302):
    return FakeResponse(status_code=status, headers={"Location": location})


def _image(body=b"png", content_type="image/png", headers=None):
    return FakeResponse(
        headers={"Content-Type": content_type, **(headers or {})},
        chunks=[body],
    )


def test_every_hop_of_a_public_chain_is_validated_and_fetched(monkeypatch):
    chain = ChainRecorder(
        monkeypatch,
        dns={
            "cdn.test": [PUBLIC_IP],
            "cdn2.test": [PUBLIC_IP_2],
            "cdn3.test": [PUBLIC_IP_3],
        },
        responses=[
            _redirect("https://cdn2.test/middle"),
            _redirect("https://cdn3.test/final.png"),
            _image(),
        ],
    )

    data, mime = safe_fetch.fetch_image("https://cdn.test/start", "agent")

    assert (data, mime) == (b"png", "image/png")
    # Each hop was resolved (validated) before it was requested.
    assert chain.dns_calls == ["cdn.test", "cdn2.test", "cdn3.test"]
    assert chain.http_calls == [
        "https://cdn.test/start",
        "https://cdn2.test/middle",
        "https://cdn3.test/final.png",
    ]


def test_revalidation_is_not_cached_across_hops_on_the_same_host(monkeypatch):
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP]},
        responses=[
            _redirect("/a"),
            _redirect("/b"),
            _image(),
        ],
    )

    safe_fetch.fetch_image("https://cdn.test/start", "agent")

    # The same host is re-resolved on every hop: validation is per request,
    # not a one-time check of the original URL.
    assert chain.dns_calls == ["cdn.test", "cdn.test", "cdn.test"]
    assert chain.http_calls == [
        "https://cdn.test/start",
        "https://cdn.test/a",
        "https://cdn.test/b",
    ]


def test_a_private_address_deep_in_the_chain_is_never_requested(monkeypatch):
    first = _redirect("https://ok.test/middle")
    second = _redirect("http://internal.test/secret")
    chain = ChainRecorder(
        monkeypatch,
        dns={
            "cdn.test": [PUBLIC_IP],
            "ok.test": [PUBLIC_IP_2],
            "internal.test": [PRIVATE_IP],
        },
        responses=[first, second],
    )

    with pytest.raises(safe_fetch.UnsafeURLError, match="non-public address"):
        safe_fetch.fetch_image("https://cdn.test/start", "agent")

    # The private hop was validated (DNS was consulted) but never requested.
    assert chain.dns_calls == ["cdn.test", "ok.test", "internal.test"]
    assert chain.http_calls == [
        "https://cdn.test/start",
        "https://ok.test/middle",
    ]
    assert first.closed and second.closed


def test_a_redirect_to_a_mixed_resolution_host_is_rejected(monkeypatch):
    chain = ChainRecorder(
        monkeypatch,
        dns={
            "cdn.test": [PUBLIC_IP],
            # One public and one private record: the whole host is unsafe.
            "mixed.test": [PUBLIC_IP_2, PRIVATE_IP],
        },
        responses=[_redirect("https://mixed.test/cover.png")],
    )

    with pytest.raises(safe_fetch.UnsafeURLError, match="non-public address"):
        safe_fetch.fetch_image("https://cdn.test/start", "agent")

    assert chain.http_calls == ["https://cdn.test/start"]


@pytest.mark.parametrize(
    "location",
    [
        # IPv4-mapped loopback.
        "http://[::ffff:127.0.0.1]/secret",
        # 6to4 tunnel embedding 127.0.0.1.
        "http://[2002:7f00:1::]/secret",
        # Teredo tunnel address.
        "http://[2001:0000:4136:e378:8000:63bf:3fff:fdd2]/secret",
        # Link-local cloud metadata endpoint.
        "http://169.254.169.254/latest/meta-data/",
        # Plain loopback and RFC1918 literals.
        "http://127.0.0.1/secret",
        "http://192.168.1.10/secret",
    ],
)
def test_a_redirect_to_a_non_public_literal_is_never_requested(
    monkeypatch, location
):
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP]},
        responses=[_redirect(location)],
    )

    with pytest.raises(safe_fetch.UnsafeURLError):
        safe_fetch.fetch_image("https://cdn.test/start", "agent")

    assert chain.http_calls == ["https://cdn.test/start"]


def test_a_redirect_to_a_non_http_scheme_is_rejected(monkeypatch):
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP]},
        responses=[_redirect("ftp://cdn.test/cover.png")],
    )

    with pytest.raises(safe_fetch.UnsafeURLError, match="Only http and https"):
        safe_fetch.fetch_image("https://cdn.test/start", "agent")

    assert chain.http_calls == ["https://cdn.test/start"]


def test_a_redirect_with_embedded_credentials_is_rejected(monkeypatch):
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP]},
        responses=[_redirect("https://user:pass@cdn.test/cover.png")],
    )

    with pytest.raises(safe_fetch.UnsafeURLError, match="embedded credentials"):
        safe_fetch.fetch_image("https://cdn.test/start", "agent")

    assert chain.http_calls == ["https://cdn.test/start"]


def test_a_redirect_without_a_location_closes_the_response(monkeypatch):
    response = FakeResponse(status_code=302)
    chain = ChainRecorder(
        monkeypatch, dns={"cdn.test": [PUBLIC_IP]}, responses=[response]
    )

    with pytest.raises(safe_fetch.UnsafeURLError, match="no Location"):
        safe_fetch.fetch_image("https://cdn.test/start", "agent")

    assert response.closed is True
    assert chain.http_calls == ["https://cdn.test/start"]


def test_the_redirect_limit_stops_the_chain(monkeypatch):
    first = _redirect("/two", status=301)
    second = _redirect("/three", status=301)
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP]},
        responses=[first, second, _image()],
    )

    with pytest.raises(safe_fetch.UnsafeURLError, match="Too many redirects"):
        safe_fetch.fetch_image(
            "https://cdn.test/one", "agent", max_redirects=1
        )

    # The final image was never requested and every response was closed.
    assert chain.http_calls == ["https://cdn.test/one", "https://cdn.test/two"]
    assert first.closed and second.closed


def test_a_non_image_content_type_on_the_final_hop_fails_closed(monkeypatch):
    redirect = _redirect("/page")
    page = _image(content_type="text/html")
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP]},
        responses=[redirect, page],
    )

    with pytest.raises(safe_fetch.UnsafeURLError, match="did not return an image"):
        safe_fetch.fetch_image("https://cdn.test/start", "agent")

    assert redirect.closed and page.closed


def test_a_declared_length_over_the_cap_on_the_final_hop_fails_closed(monkeypatch):
    redirect = _redirect("/big.jpg")
    big = _image(headers={"Content-Length": "11"}, content_type="image/jpeg")
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP]},
        responses=[redirect, big],
    )

    with pytest.raises(safe_fetch.ImageTooLargeError, match="too large"):
        safe_fetch.fetch_image("https://cdn.test/start", "agent", max_bytes=10)

    assert redirect.closed and big.closed


def test_a_streamed_overflow_on_the_final_hop_fails_closed(monkeypatch):
    redirect = _redirect("/big.jpg")
    big = FakeResponse(
        headers={"Content-Type": "image/jpeg"},
        chunks=[b"123456", b"78901"],
    )
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP]},
        responses=[redirect, big],
    )

    with pytest.raises(safe_fetch.ImageTooLargeError, match="too large"):
        safe_fetch.fetch_image("https://cdn.test/start", "agent", max_bytes=10)

    assert redirect.closed and big.closed


def test_a_relative_redirect_is_resolved_against_the_current_hop(monkeypatch):
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP], "cdn2.test": [PUBLIC_IP_2]},
        responses=[
            _redirect("../images/cover.png"),
            _image(),
        ],
    )

    data, _ = safe_fetch.fetch_image("https://cdn.test/a/b/start", "agent")

    assert data == b"png"
    assert chain.http_calls == [
        "https://cdn.test/a/b/start",
        "https://cdn.test/a/images/cover.png",
    ]


def test_the_preview_endpoint_revalidates_redirect_targets(
    client, auth_headers, monkeypatch
):
    """End to end through the cover-preview route: a redirect to a private
    address must be rejected with the existing 400 contract and the private
    host must never be requested."""
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP], "internal.test": [PRIVATE_IP]},
        responses=[_redirect("http://internal.test/secret")],
    )

    response = client.get(
        "/api/metadata/picture/preview",
        headers=auth_headers,
        query_string={"url": "https://cdn.test/start"},
    )

    assert response.status_code == 400
    assert "non-public" in response.get_json()["error"]
    assert chain.dns_calls == ["cdn.test", "internal.test"]
    assert chain.http_calls == ["https://cdn.test/start"]


def test_the_preview_endpoint_serves_a_public_redirect_chain(
    client, auth_headers, monkeypatch
):
    chain = ChainRecorder(
        monkeypatch,
        dns={"cdn.test": [PUBLIC_IP], "cdn2.test": [PUBLIC_IP_2]},
        responses=[
            _redirect("https://cdn2.test/cover.png"),
            _image(body=b"image-bytes"),
        ],
    )

    response = client.get(
        "/api/metadata/picture/preview",
        headers=auth_headers,
        query_string={"url": "https://cdn.test/start"},
    )

    assert response.status_code == 200
    assert response.data == b"image-bytes"
    assert response.mimetype == "image/png"
    assert chain.dns_calls == ["cdn.test", "cdn2.test"]
