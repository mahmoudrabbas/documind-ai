# Sign-In Credentials

## Super Admin

| Field | Value |
|-------|-------|
| **URL** | `/super-admin/login` |
| **Email** | `superadmin@documind.ai` |
| **Password** | `DocuMind@2026` |
| **Tenant Slug** | *(not required)* |
| **Role** | SUPER_ADMIN |

---

## Tenant: ITI (slug: `iti`)

| Role | Email | Password |
|------|-------|----------|
| COMPANY_ADMIN | `admin@iti.com` | `Admin@123456` |
| EMPLOYEE | `ahmed@iti.com` | `Employee@123456` |
| EMPLOYEE | `sara@iti.com` | `Employee@123456` |

**Login URL:** `/login` with Company Slug = `iti`

---

## Tenant: Acme Corp (slug: `acme-corp`)

| Role | Email | Password |
|------|-------|----------|
| COMPANY_ADMIN | `admin@acme.com` | `Admin@123456` |
| EMPLOYEE | `john@acme.com` | `Employee@123456` |
| EMPLOYEE | `jane@acme.com` | `Employee@123456` |

**Login URL:** `/login` with Company Slug = `acme-corp`

---

## Notes

- All users are **email-verified** and **active**.
- Super Admin logs in at `/super-admin/login` (no company slug needed).
- Regular users log in at `/login` and must provide their **Company Slug**.
- Passwords use Argon2id hashing.
- Subscriptions are `ACTIVE` with the **free** package.
