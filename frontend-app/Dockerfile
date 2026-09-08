FROM node:24.18.1-alpine AS build
WORKDIR /app

# 빌드 시점에 백엔드 API 주소를 주입한다 (Vite는 빌드 타임에 env를 번들에 굽는다)
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
