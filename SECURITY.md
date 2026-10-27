# Security Policy

## Supported Version

Security fixes are applied to the latest code on the default
branch. Older revisions and third-party forks may not receive
updates.

## Reporting

Use GitHub's private security advisory feature for this
repository when it is available. Do not include active
credentials, cookies, private page content, or personal data in
a public issue.

A useful report should include:

- A short description of the issue and its impact.
- The affected file or permission.
- Reproduction steps using synthetic test data.
- The browser and extension version.
- A proposed mitigation, if known.

## Project Security Model

The extension processes page content locally. The current
implementation does not include analytics, telemetry, an
account system, or a remote code loader.

The extension requests broad host access because it inspects
pages for visual overlays and article content. Review any
change that adds network requests, remote scripts, new host
permissions, or collection of page data with extra care.

## Disclosure

Please allow time to investigate and prepare a fix before
publishing details. Coordination and disclosure timelines may
vary based on severity, exploitability, and upstream browser
behavior.
