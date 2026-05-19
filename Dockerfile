FROM php:8.2-apache

# Instalar extensiones necesarias (curl, json, etc.)
RUN docker-php-ext-install curl

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
