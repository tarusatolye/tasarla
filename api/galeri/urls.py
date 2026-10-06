from django.urls import path

from . import meta, views

urlpatterns = [
    path("saglik/", views.Saglik.as_view()),
    path("tasarimlar/", views.TasarimOlustur.as_view()),
    path("tasarimlar/<str:kod>/", views.TasarimAyrinti.as_view()),
    path("tasarimlar/<str:kod>/begen/", views.Begen.as_view()),
    path("tasarimlar/<str:kod>/sikayet/", views.SikayetEt.as_view()),
    path("galeri/", views.Galeri.as_view()),
    path("etiketler/", views.Etiketler.as_view()),
    path("paylasim-meta/", meta.paylasim_meta),
    path("yonetici/", views.Yonetici.as_view()),
    path("moderasyon/<str:kod>/", views.Moderasyon.as_view()),
]
