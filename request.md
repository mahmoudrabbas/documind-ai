

```

# request

GET http://localhost:5000 HTTP/1.1
Content-Type: application/json
Authorization: Bearer <your_token_here>


# response

HTTP/1.1 200 OK
X-Powered-By: Express
Content-Type: application/json; charset=utf-8
Content-Length: 32
ETag: W/"20-gVrg0gd+ksTx6Q67Klblr7CzIPs"
Date: Sun, 05 Jul 2026 17:47:00 GMT
Connection: close

{
  "message": "API is running now"
}

```
-------------------------------

GET /auth/me

Description
- Returns the currently authenticated user and tenant for a valid access token.

Request
- Method: GET
- Path: /auth/me
- Authentication: Bearer access token in the Authorization header (e.g. "Authorization: Bearer <token>")

Successful response (200)
{
  "success": true,
  "data": {
    "user": {
      "id": "string",
      "tenantId": "string",
      "name": "string",
      "email": "string",
      "role": "string",
      "status": "active",
      "emailVerified": true
    },
    "tenant": {
      "id": "string",
      "name": "string",
      "slug": "string",
      "status": "active",
      "plan": "free"
    }
  }
}

Error responses
- 401 Unauthorized: returned when the access token is missing, invalid, or expired. Response example:
{
  "success": false,
  "message": "Authentication required",
  "error": "UNAUTHORIZED",
  "details": null
}

Notes
- The endpoint expects a JWT access token signed with the server's access JWT secret.
- For testing locally, call POST /auth/login to obtain an accessToken, then include it in the Authorization header.

-------------------------------

## USERS MANAGEMENT APIs (T3.1.5)

### POST /users - Invite User

Description
- Invites a new user to the tenant. Creates a user account with pending status and sends email verification.
- Only COMPANY_ADMIN role can invite users.
- Automatically scoped to the authenticated user's tenant.

Request
- Method: POST
- Path: /users
- Authentication: Bearer token in Authorization header (required)
- Content-Type: application/json

Request body (example):
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "role": "EMPLOYEE"
}
```

Request fields:
- name (string, required): User's full name. Min 2 chars, max 120 chars. Only letters, numbers, and spaces allowed.
- email (string, required): Valid email address. Must be unique within the tenant.
- role (enum, required): User role. Allowed values: "EMPLOYEE", "COMPANY_ADMIN"

Successful response (201 Created):
```json
{
  "success": true,
  "message": "User invitation created successfully. An email has been sent to the invited user.",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "tenantId": "507f1f77bcf86cd799439010",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "EMPLOYEE",
      "status": "pending_email_verification",
      "emailVerified": false,
      "createdAt": "2026-07-10T10:30:00.000Z"
    }
  }
}
```

Error responses:
- 400 Bad Request: Validation failed (invalid name, email, or role)
  ```json
  {
    "success": false,
    "message": "Validation failed",
    "error": "VALIDATION_ERROR",
    "details": [
      {
        "field": "email",
        "message": "email must be a valid address"
      }
    ]
  }
  ```

- 401 Unauthorized: Missing or invalid access token
  ```json
  {
    "success": false,
    "message": "Authentication required",
    "error": "UNAUTHORIZED",
    "details": null
  }
  ```

- 403 Forbidden: User is not COMPANY_ADMIN
  ```json
  {
    "success": false,
    "message": "Insufficient permissions",
    "error": "FORBIDDEN",
    "details": null
  }
  ```

- 409 Conflict: Email already exists in this tenant
  ```json
  {
    "success": false,
    "message": "Email already exists in this tenant",
    "error": "EMAIL_ALREADY_EXISTS",
    "details": null
  }
  ```

Notes
- The invited user receives an email with a verification link
- Email verification token expires in 24 hours
- User status is "pending_email_verification" until they set their password

-------------------------------

### GET /users - List Users

Description
- Retrieves a paginated list of all users in the authenticated user's tenant.
- COMPANY_ADMIN and EMPLOYEE roles can list users.
- Automatically scoped to the authenticated user's tenant.

Request
- Method: GET
- Path: /users
- Authentication: Bearer token in Authorization header (required)
- Query parameters:
  - page (number, optional): Page number (1-indexed). Default: 1
  - pageSize (number, optional): Records per page. Default: 20, Max: 100

Example requests:
```
GET /users HTTP/1.1
Authorization: Bearer your_access_token

GET /users?page=2&pageSize=10 HTTP/1.1
Authorization: Bearer your_access_token
```

Successful response (200 OK):
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "507f1f77bcf86cd799439011",
        "tenantId": "507f1f77bcf86cd799439010",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "EMPLOYEE",
        "status": "pending_email_verification",
        "emailVerified": false,
        "createdAt": "2026-07-10T10:30:00.000Z"
      },
      {
        "id": "507f1f77bcf86cd799439012",
        "tenantId": "507f1f77bcf86cd799439010",
        "name": "Jane Smith",
        "email": "jane@example.com",
        "role": "COMPANY_ADMIN",
        "status": "active",
        "emailVerified": true,
        "createdAt": "2026-07-10T09:15:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "totalPages": 3,
      "totalRecords": 25
    }
  }
}
```

Response fields:
- users (array): List of user objects
  - id: User's unique identifier
  - tenantId: Tenant the user belongs to
  - name: User's full name
  - email: User's email address
  - role: User's role ("EMPLOYEE" or "COMPANY_ADMIN")
  - status: Account status ("active", "pending_email_verification", "disabled", "pending")
  - emailVerified: Whether email is verified (boolean)
  - createdAt: ISO 8601 timestamp of account creation
- pagination: Pagination metadata
  - page: Current page number
  - pageSize: Records per page
  - totalPages: Total number of pages
  - totalRecords: Total number of users

Error responses:
- 400 Bad Request: Invalid query parameters
  ```json
  {
    "success": false,
    "message": "Validation failed",
    "error": "VALIDATION_ERROR",
    "details": [
      {
        "field": "page",
        "message": "page must be a positive integer"
      }
    ]
  }
  ```

- 401 Unauthorized: Missing or invalid access token
  ```json
  {
    "success": false,
    "message": "Authentication required",
    "error": "UNAUTHORIZED",
    "details": null
  }
  ```

Notes
- Only returns users from the authenticated user's tenant
- Pagination defaults: page=1, pageSize=20
- Maximum pageSize: 100

-------------------------------

### PATCH /users/:id - Update User

Description
- Updates a user's role or status (role editor).
- Only COMPANY_ADMIN can update users.
- Automatically scoped to the authenticated user's tenant.
- All changes are logged in the audit log.

Request
- Method: PATCH
- Path: /users/:id (where :id is the user ID)
- Authentication: Bearer token in Authorization header (required)
- Content-Type: application/json

Request path parameters:
- id: The user ID to update (MongoDB ObjectId)

Request body (example):
```json
{
  "role": "COMPANY_ADMIN"
}
```

Valid request bodies:
```json
{
  "role": "COMPANY_ADMIN"
}
```

```json
{
  "status": "disabled"
}
```

```json
{
  "role": "EMPLOYEE",
  "status": "active"
}
```

Request fields:
- role (enum, optional): New role. Allowed values: "EMPLOYEE", "COMPANY_ADMIN"
- status (enum, optional): New status. Allowed values: "active", "pending", "pending_email_verification", "disabled"
- Note: At least one field (role or status) must be provided

Successful response (200 OK):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "tenantId": "507f1f77bcf86cd799439010",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "COMPANY_ADMIN",
      "status": "active",
      "emailVerified": true,
      "createdAt": "2026-07-10T10:30:00.000Z"
    }
  }
}
```

Error responses:
- 400 Bad Request: No fields provided or invalid values
  ```json
  {
    "success": false,
    "message": "Validation failed",
    "error": "VALIDATION_ERROR",
    "details": [
      {
        "field": "role",
        "message": "Invalid role value"
      }
    ]
  }
  ```

- 401 Unauthorized: Missing or invalid access token
  ```json
  {
    "success": false,
    "message": "Authentication required",
    "error": "UNAUTHORIZED",
    "details": null
  }
  ```

- 403 Forbidden: User is not COMPANY_ADMIN
  ```json
  {
    "success": false,
    "message": "Insufficient permissions",
    "error": "FORBIDDEN",
    "details": null
  }
  ```

- 404 Not Found: User not found or belongs to different tenant
  ```json
  {
    "success": false,
    "message": "User not found",
    "error": "NOT_FOUND",
    "details": null
  }
  ```

Notes
- Changes are automatically logged to audit log
- User cannot update themselves (implicit restriction - not yet implemented)
- Only the specified fields are updated; other fields remain unchanged

-------------------------------

### POST /users/set-password-from-invite - Complete Invite

Description
- Completes user registration by setting password from an invite token.
- Public endpoint (no authentication required).
- Called by newly invited users when they click the email verification link.

Request
- Method: POST
- Path: /users/set-password-from-invite
- Authentication: None required
- Content-Type: application/json

Request body (example):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "password": "NewPassword123"
}
```

Request fields:
- token (string, required): Email verification token from the invite email
- password (string, required): New password. Must have:
  - Minimum 8 characters
  - At least 1 uppercase letter
  - At least 1 lowercase letter
  - At least 1 digit
  - Maximum 128 characters

Successful response (200 OK):
```json
{
  "success": true,
  "message": "Password set successfully. You can now log in.",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "tenantId": "507f1f77bcf86cd799439010",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "EMPLOYEE",
      "status": "active",
      "emailVerified": true,
      "createdAt": "2026-07-10T10:30:00.000Z"
    }
  }
}
```

Error responses:
- 400 Bad Request: Invalid token or weak password
  ```json
  {
    "success": false,
    "message": "Validation failed",
    "error": "VALIDATION_ERROR",
    "details": [
      {
        "field": "password",
        "message": "password must contain at least one uppercase letter"
      }
    ]
  }
  ```

- 400 Bad Request: Invalid or expired token
  ```json
  {
    "success": false,
    "message": "Invalid or expired invite token",
    "error": "INVALID_OR_EXPIRED_VERIFICATION_TOKEN",
    "details": null
  }
  ```

Notes
- Token expires after 24 hours
- After successful password set, user status changes from "pending_email_verification" to "active"
- emailVerified flag is set to true
- User can now log in with their email and new password

-------------------------------

## Testing Examples with cURL

### 1. Register and Login
```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@company.com",
    "password": "Password123",
    "companyName": "Test Company"
  }'

# Login (use the response to get accessToken)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@company.com",
    "password": "Password123"
  }'

# Save the accessToken for the following requests
export TOKEN="your_access_token_here"
```

### 2. Invite a User
```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "role": "EMPLOYEE"
  }'
```

### 3. List Users
```bash
# List first page with 10 results per page
curl -X GET "http://localhost:5000/api/users?page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Update User Role
```bash
# Get a user ID from the list response
export USER_ID="507f1f77bcf86cd799439011"

curl -X PATCH http://localhost:5000/api/users/$USER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "role": "COMPANY_ADMIN"
  }'
```

### 5. Set Password from Invite (Simulated - requires real token)
```bash
# Note: The token comes from the email sent during invitation
curl -X POST http://localhost:5000/api/users/set-password-from-invite \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "password": "MyNewPassword123"
  }'
```
