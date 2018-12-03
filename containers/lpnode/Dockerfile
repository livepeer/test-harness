FROM ubuntu:16.04
FROM jrottenberg/ffmpeg:4.0-ubuntu

WORKDIR /
ARG LIVEPEER_BINARY=./livepeer_linux

RUN mkdir /lpGeth && mkdir /lpData

COPY --from=jrottenberg/ffmpeg:4.0-ubuntu /usr/local /usr/local

COPY ${LIVEPEER_BINARY} /usr/bin

COPY ./keystore /lpData/keystore
#COPY ./start.sh .

EXPOSE 7935/tcp
EXPOSE 8935/tcp
EXPOSE 1935/tcp

ENTRYPOINT ["/usr/bin/livepeer"]
CMD ["--help"]

#RUN chmod +x start.sh
#ENTRYPOINT ./start.sh

#FFS don't forget binding to 0.0.0.0 ,, ugh....
#docker run -p 8935:8935 lpnode -rinkeby -datadir /lpData -v 7 -httpAddr 0.0.0.0:8935 -cliAddr 0.0.0.0:7935
