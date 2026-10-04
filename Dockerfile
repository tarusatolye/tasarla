# tasarla.tarus.tr — statik yayın (derleme adımı yok). Coolify: Build Pack = Dockerfile, port 80.
FROM nginx:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html manifest.webmanifest LICENSE UCUNCU-TARAF-LISANSLARI.md /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/
COPY styles/ /usr/share/nginx/html/styles/
COPY public/ /usr/share/nginx/html/public/
COPY vendor/ /usr/share/nginx/html/vendor/
# /version.json: hata döngüsü izleyicisi ve canlı sürüm kontrolü okur (Coolify SOURCE_COMMIT verir)
ARG SOURCE_COMMIT=yerel
RUN SURUM=$(sed -n "s/.*APP_VERSION = '\([0-9.]*\)'.*/\1/p" /usr/share/nginx/html/js/surum.js) && \
    printf '{"app":"tasarla","version":"%s","commit":"%s","built_at":"%s"}\n' "$SURUM" "$SOURCE_COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      > /usr/share/nginx/html/version.json
EXPOSE 80
