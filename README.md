# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name wallet-bc2.nitopool.fr;
    return 301 https://$host$request_uri;
}

# HTTPS + reverse proxy API
server {
    listen 443 ssl;
    server_name wallet-bc2.nitopool.fr;

    ssl_certificate /etc/letsencrypt/live/wallet-bc2.nitopool.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wallet-bc2.nitopool.fr/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    root /var/www/wallet-bc2;
    index index.html;

    # CSP: plus aucun appel à l'explorer côté front; liens externes OK (pas de navigate-to)
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; connect-src 'self' https://wallet-bc2.nitopool.fr/api/ https://wallet-bc2.nitopool.fr/langs/; img-src 'self' https://raw.githubusercontent.com; style-src 'self' 'unsafe-inline';" always;

    # API vers le nœud (CORS OK, pas de cache)
    location /api/ {
        proxy_pass http://217.160.149.211:18339/;
        proxy_set_header Authorization "Basic dXNlcjpwYXNz";
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type' always;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type' always;
            add_header 'Content-Length' 0;
            return 204;
        }
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Compteurs sans cache
    location /api/increment-counter {
        try_files $uri $uri/ /api/counter.php;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }
    location /api/get-counter {
        try_files $uri $uri/ /api/counter.php;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    # Traductions (CORS OK, pas de cache)
    location /langs/ {
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
            add_header 'Content-Length' 0;
            return 204;
        }
        try_files $uri $uri/ =404;
    }

    # JS/CSS/HTML sans cache (sauf index.html)
    location ~* \.(js|css|html)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        try_files $uri $uri/ =404;
    }

    # JSON sans cache (hors /langs/)
    location ~* \.json$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        add_header Content-Type "application/json";
        try_files $uri $uri/ =404;
    }

    # PHP sans cache
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    # index.html avec cache
    location = /index.html {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }

    # Fallback SPA
    location / {
        try_files $uri $uri/ /index.html;
    }
}
