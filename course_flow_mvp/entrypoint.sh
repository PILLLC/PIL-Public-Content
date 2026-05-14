#!/usr/bin/env bash
set -e

# Seed .env if missing (dev)
if [ ! -f "/app/.env" ] && [ -f "/app/.env.example" ]; then
  cp /app/.env.example /app/.env
fi

# Apply DB migrations
python manage.py migrate --noinput

# Create superuser if it doesn't exist (dev/demo)
python - <<'PY'
import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "course_flow.settings")
django.setup()
from django.contrib.auth import get_user_model
User = get_user_model()
u = os.getenv("DJANGO_SUPERUSER_USERNAME")
e = os.getenv("DJANGO_SUPERUSER_EMAIL")
p = os.getenv("DJANGO_SUPERUSER_PASSWORD")
if u and e and p:
    if not User.objects.filter(username=u).exists():
        User.objects.create_superuser(u, e, p)
        print(f"✅ Created superuser '{u}'")
    else:
        print(f"ℹ️ Superuser '{u}' already exists")
else:
    print("ℹ️ Superuser env vars not set; skipping auto-create")
PY

# Collect static (safe no-op in dev)
python manage.py collectstatic --noinput || true

# Start server
if [ "${DEBUG}" = "0" ] || [ "${DEBUG}" = "false" ]; then
  echo "Starting Django (prod-like)"
  exec python manage.py runserver 0.0.0.0:8000 --noreload
else
  echo "Starting Django (dev)"
  exec python manage.py runserver 0.0.0.0:8000 --noreload
fi
