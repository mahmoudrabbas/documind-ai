

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
