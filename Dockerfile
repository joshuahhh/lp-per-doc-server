FROM alpine

RUN apk update

RUN apk add --update texlive
RUN apk add --update texmf-dist-latexextra
RUN apk add --update pandoc
RUN apk add --update nodejs
RUN apk add --update npm

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

# other candidates:
# texmf-dist-bibtexextra
# texmf-dist-fontsextra
# texmf-dist-formatsextra
# texmf-dist-games
# texmf-dist-humanities
# texmf-dist-music
# texmf-dist-pictures
# texmf-dist-pstricks
# texmf-dist-publishers
# texmf-dist-science
