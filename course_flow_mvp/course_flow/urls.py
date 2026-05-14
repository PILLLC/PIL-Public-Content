from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse

def health(_):
    return HttpResponse("ok")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("django.contrib.auth.urls")),
    path("health/", health, name="health"),
    path("", include(("courses.urls", "courses"), namespace="courses")),
]
