FROM alpine

# big to small, for caching convenience
RUN apk add --update texlive
RUN apk add --update pandoc
RUN apk add --update nodejs
RUN apk add --update npm

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
