FROM php:8.2-apache

# Instalar dependencias del sistema y curl
RUN apt-get update && apt-get install -y \
        libcurl4-openssl-dev \
        curl \
    && docker-php-ext-install curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Habilitar módulos de Apache
RUN a2enmod rewrite headers

# Copiar todo el proyecto al directorio raíz de Apache
COPY . /var/www/html/

# Configurar permisos
RUN chown -R www-data:www-data /var/www/html && \
    chmod -R 755 /var/www/html

# Exponer el puerto 80
EXPOSE 80

# Comando por defecto (Apache en primer plano)
CMD ["apache2-foreground"]
