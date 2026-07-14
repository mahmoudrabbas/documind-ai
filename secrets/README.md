# Local runtime secrets

Files in this directory are runtime-only and ignored by Git. Copy each `*.example` file to the same name without `.example`, then replace its placeholder locally. Never commit the resulting files or paste their values into issues, logs, snapshots, CI summaries, or documentation.

```sh
cp secrets/api_jwt_secret.txt.example secrets/api_jwt_secret.txt
cp secrets/api_refresh_secret.txt.example secrets/api_refresh_secret.txt
cp secrets/api_email_verification_secret.txt.example secrets/api_email_verification_secret.txt
cp secrets/api_password_reset_secret.txt.example secrets/api_password_reset_secret.txt
cp secrets/api_smtp_pass.txt.example secrets/api_smtp_pass.txt
cp secrets/api_super_admin_bootstrap_key.txt.example secrets/api_super_admin_bootstrap_key.txt
cp secrets/worker_mongodb_uri.txt.example secrets/worker_mongodb_uri.txt
cp secrets/worker_redis_url.txt.example secrets/worker_redis_url.txt
```

Generate independent high-entropy authentication secrets using an approved password manager or secret manager. Database and Redis files contain deployment-specific connection URIs. Compose mounts these files through `/run/secrets`; production deployments must use their managed secret facility instead of repository files.

## Rotation after possible repository exposure

Assume every formerly tracked value is exposed, even after deletion from the current tree.

1. Inventory the secret names only: access JWT, refresh JWT, email-verification JWT, password-reset JWT, SMTP credential, bootstrap key, worker MongoDB URI, and worker Redis URI.
2. Revoke or rotate each credential at its owning system. Do not reuse one generated value for multiple purposes.
3. Update the protected CI/deployment secret store and local ignored files.
4. Restart affected services. Rotating JWT keys invalidates relevant outstanding sessions or links; communicate that impact.
5. Verify old credentials fail and new credentials work using provider audit logs without copying values into the ticket.
6. Review repository history and access logs. If organizational policy requires history rewriting, coordinate it separately with all contributors.
7. Before any coordinated history rewrite, freeze merges and notify every contributor of the rewrite window and affected branches/tags.
8. After the rewrite, require every contributor and deployment checkout to remove the old clone and re-clone the cleaned repository. Do not merge or push from an old clone.
9. Verify protected branches, tags, forks, mirrors, caches, build artifacts, and backups according to organizational retention policy; record completion without recording credential values.

Operational completion checklist:

- [ ] Every formerly tracked credential has been rotated or revoked.
- [ ] Provider-side checks confirm every old credential is invalid.
- [ ] Refresh sessions and other long-lived authentication sessions have been invalidated where applicable.
- [ ] New credentials are present only in approved secret stores and ignored local runtime files.
- [ ] The team has approved a coordinated Git-history cleanup plan.
- [ ] After a future rewrite, all contributors and deployment systems have re-cloned from the cleaned repository.
- [ ] Security and provider audit logs have been reviewed for suspicious use.

Run `npm run security:secrets` before committing. The scanner reports only a file path and detection category, never the matching value.
