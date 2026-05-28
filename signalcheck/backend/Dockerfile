FROM python:3.10-slim

WORKDIR /app

COPY backend /app
COPY sandbox /app/sandbox

RUN pip install Flask

EXPOSE 5001

CMD ["python", "app.py"]
