# One-time Super Admin bootstrap

> Never put the bootstrap key in a tracked `.env` or documentation. Use a managed deployment secret or the ignored `secrets/api_super_admin_bootstrap_key.txt` file described in `secrets/README.md`. Rotate any key that may previously have been committed.

The platform administrator is created by a backend-only, one-time deployment operation. Vercel frontend deployment does not create this database account, and the frontend never receives the bootstrap key.

1. Deploy the backend and connect it to the production MongoDB database.
2. Temporarily set `ENABLE_SUPER_ADMIN_BOOTSTRAP=true` and set `SUPER_ADMIN_BOOTSTRAP_KEY` to a random secret of at least 32 characters.
3. Restart or redeploy the backend.
4. Call the deployed backend (not the frontend):

```sh
curl -i \
  -X POST https://<backend-domain>/internal/bootstrap/super-admin \
  -H "Content-Type: application/json" \
  -H "X-Super-Admin-Bootstrap-Key: <long-random-secret>" \
  -d '{
    "name": "Platform Administrator",
    "email": "admin@example.com",
    "password": "<strong-password>"
  }'
```

5. Confirm HTTP 201. Further creation attempts return HTTP 409.
6. Set `ENABLE_SUPER_ADMIN_BOOTSTRAP=false`, remove the key where operationally possible, and restart/redeploy immediately.
7. Open `https://<frontend-domain>/super-admin/login`, sign in, and confirm the redirect to `/super-admin/tenants`.

When disabled, the bootstrap endpoint returns 404. The reserved `documind.ai` tenant exists because the current user, JWT, refresh-session, and `/auth/me` contracts require a trusted platform tenant identifier. It is excluded from platform tenant management and cannot be registered publicly.
