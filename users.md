# Users — Sign-In Accounts

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

| Role | Name | Email | Password |
|------|------|-------|----------|
| COMPANY_ADMIN | ITI Admin | `admin@iti.com` | `Admin@123456` |
| EMPLOYEE | Ahmed Hassan | `ahmed@iti.com` | `Employee@123456` |
| EMPLOYEE | Sara Mohamed | `sara@iti.com` | `Employee@123456` |

**Login URL:** `/login` with Company Slug = `iti`

---

## Tenant: Acme Corp (slug: `acme-corp`)

| Role | Name | Email | Password |
|------|------|-------|----------|
| COMPANY_ADMIN | Acme Admin | `admin@acme.com` | `Admin@123456` |
| EMPLOYEE | John Smith | `john@acme.com` | `Employee@123456` |
| EMPLOYEE | Jane Doe | `jane@acme.com` | `Employee@123456` |

**Login URL:** `/login` with Company Slug = `acme-corp`

---

## Notes

- All users are **email-verified** and **active**.
- Super Admin logs in at `/super-admin/login` (no company slug needed).
- Regular users log in at `/login` and must provide their **Company Slug**.
- Passwords use Argon2id hashing.
- Subscriptions are `ACTIVE` with the **free** package.
