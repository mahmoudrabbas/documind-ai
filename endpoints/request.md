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
