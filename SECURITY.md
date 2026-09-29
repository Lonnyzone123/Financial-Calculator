# Security policy

## What this project is

Financial-Calculator is a retirement projection model. It ships as one self-contained HTML file that runs in your
browser, on your own device. It has no server, no accounts and no analytics, and it sends nothing anywhere: the plans
you enter stay in that browser. The engine also runs under Node for the test suite.

That shapes what counts as a security problem here. Examples of things worth reporting:

- a way for a plan file, imported or pasted, to run script in the page or to read data it shouldn't;
- anything that makes the page contact a network address;
- a secret or credential committed to the repository;
- a weakness in the GitHub Actions workflows (`.github/workflows/`) that would let a pull request gain write access or
  run code it shouldn't.

A wrong financial figure is not a security issue. Please open an ordinary issue for it, with the plan and the figures
you expected. And remember that nothing here is financial, tax or legal advice (see the [README](README.md)).

## Supported versions

Only the current `main` branch is maintained. There are no releases or back-ported fixes.

## Reporting a vulnerability

Please report privately, not in a public issue:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**. This uses GitHub's private vulnerability reporting, so only the maintainer sees
   the report.

Include what you found, how to reproduce it, and what it could let someone do.

This is a one-person project maintained in spare time. Expect an acknowledgement within about a week, and a fix or a
decision as soon as the problem is understood. When a fix lands, the advisory will credit you, unless you'd rather
not be named.
