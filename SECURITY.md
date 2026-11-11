# Security Policy

## Supported Versions

Security fixes are handled on the default branch until the project publishes
stable release lines.

## Reporting A Vulnerability

Please report suspected vulnerabilities privately through GitHub's private
vulnerability reporting flow when it is enabled for this repository. If private
reporting is not available yet, open a minimal public issue asking for a private
security contact without disclosing exploit details.

Include the affected version or commit, reproduction steps, expected impact,
and any relevant logs. Please do not disclose exploit details publicly until the
issue has been reviewed.

## Scope

The public repository ships a neutral playlist import provider API. Third-party
providers run in the Electron main process and are responsible for their own
security posture, legal compliance, and input validation.
