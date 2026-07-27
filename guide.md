# Team Setup Guide (After `git pull`)

Follow these steps after pulling the latest changes.

---

## Step 1: Copy Example Secret Files

Run the following commands:

```bash
cp secrets/api_jwt_secret.txt.example secrets/api_jwt_secret.txt
cp secrets/api_refresh_secret.txt.example secrets/api_refresh_secret.txt
cp secrets/api_email_verification_secret.txt.example secrets/api_email_verification_secret.txt
cp secrets/api_password_reset_secret.txt.example secrets/api_password_reset_secret.txt
cp secrets/api_smtp_pass.txt.example secrets/api_smtp_pass.txt
cp secrets/api_super_admin_bootstrap_key.txt.example secrets/api_super_admin_bootstrap_key.txt
cp secrets/worker_mongodb_uri.txt.example secrets/worker_mongodb_uri.txt
cp secrets/worker_redis_url.txt.example secrets/worker_redis_url.txt
```

---

## Step 2: Generate Secret Values

Replace the placeholder values by generating secure secrets:

```bash
openssl rand -hex 32 > secrets/api_jwt_secret.txt
openssl rand -hex 32 > secrets/api_refresh_secret.txt
openssl rand -hex 32 > secrets/api_email_verification_secret.txt
openssl rand -hex 32 > secrets/api_password_reset_secret.txt
openssl rand -hex 32 > secrets/api_super_admin_bootstrap_key.txt
```

### Worker Configuration

Use the Docker internal service addresses:

```bash
echo -n "mongodb://mongodb:27017/docsai" > secrets/worker_mongodb_uri.txt
echo -n "redis://redis:6379" > secrets/worker_redis_url.txt
```

---

## Step 3: Configure SMTP Password

Each developer must use their own Gmail App Password.

```bash
echo -n "your-gmail-app-password" > secrets/api_smtp_pass.txt
```

### Generate a Gmail App Password

1. Go to **https://myaccount.google.com/security**
2. Enable **2-Step Verification**
3. Open **App passwords**
4. Generate a password for **Mail**
5. Copy the generated password into `secrets/api_smtp_pass.txt`

---

## Step 4: Update `api/.env`

Each developer should configure their own email address:

```env
SMTP_USER=your-email@gmail.com
SMTP_FROM=your-email@gmail.com
```

All other environment variables can remain unchanged.

---

## Step 5: Build and Start the Project

```bash
docker compose up --build -d
```

---

## Step 6: Verify Everything is Running

Check that all services are running:

```bash
docker compose ps
```

Expected result:

- All **6 services** should have the status **Up**.

Then verify the API logs:

```bash
docker compose logs api
```

You should see a message similar to:

```text
Server listening...
```

---

## Setup Complete

Your local development environment is now ready.