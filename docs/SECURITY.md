# Atrium Security — Snyk Integration

Snyk is Atrium's software-security layer. It stays outside the classroom
runtime: Snyk scans application source and dependency metadata, never student
records, assignment contents, credentials, or sponsor payloads.

## What is scanned

- `package.json` and `package-lock.json` for vulnerable open-source dependencies
  and license issues.
- TypeScript and JavaScript source with Snyk Code static analysis when Snyk Code
  is enabled for the organization.
- Every push and pull request through `.github/workflows/snyk.yml`.
- The `main` dependency snapshot through `snyk monitor`, so newly disclosed
  vulnerabilities appear in the Snyk dashboard without a code change.

High-severity dependency findings with a Snyk-computed upgrade fail the security
workflow. Findings without a currently supported upgrade remain visible in
SARIF and the monitored Snyk project without breaking the application build.
This follows Snyk's `--fail-on=upgradable` CI policy. Snyk Code is best-effort
until that feature is enabled for the organization.

## One-time setup

1. Create or sign in to the team's Snyk account.
2. Copy the API token from Snyk account settings.
3. In the GitHub repository, open **Settings → Secrets and variables →
   Actions** and create the repository secret `SNYK_TOKEN`.
4. Run the **Snyk Security** workflow manually once, or push a branch and open
   a pull request.

The workflow reports an explicit warning and skips provider calls when the
secret is unavailable, including pull requests opened from forks.

## Local use

Authenticate without writing a token into the repository:

```bash
npm install --global snyk
snyk auth
```

Then run:

```bash
snyk test --all-projects --severity-threshold=high --fail-on=upgradable
snyk code test --severity-threshold=high
snyk monitor --all-projects --project-name=atrium
```

Do not commit a Snyk token or place it in `NEXT_PUBLIC_*`. CI reads it only from
GitHub's encrypted `SNYK_TOKEN` secret.

## Demo proof

For judging, show the latest **Snyk Security** workflow, its two scan steps,
the GitHub Security findings, and the monitored `atrium` project in Snyk. This
demonstrates a real preventive gate and ongoing vulnerability monitoring rather
than a decorative SDK import.
