"""Bütün uçlar /api/ altında; nginx /api/'yi bu servise olduğu gibi iletir."""
from django.conf import settings
from django.urls import include, path
from django.views.static import serve

urlpatterns = [path("api/", include("galeri.urls"))]

if settings.DEBUG:
    urlpatterns.append(path("api/medya/<path:path>", serve, {"document_root": settings.MEDIA_ROOT}))
