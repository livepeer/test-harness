#FROM ubuntu:16.04
FROM jrottenberg/ffmpeg:4.0-ubuntu

WORKDIR /
ARG LIVEPEER_BINARY=./binaries
ARG JSON_KEY='{"address":"c5065c9eeebe6df2c2284d046bfc906501846c51","crypto":{"cipher":"aes-128-ctr","ciphertext":"28bacda23881e4ed0d55e7ffbea01fcba4db094e8e28fc2eafd3ae525ee59bc7","cipherparams":{"iv":"c09f76210870c6d9c954c66ee9a291b5"},"kdf":"scrypt","kdfparams":{"dklen":32,"n":262144,"p":1,"r":8,"salt":"26713bf7960779554cd33ca7946cefdb3120a10842f51114d921723f49a3312b"},"mac":"12e327baafd40c00ed83a6c1245671a6e710f9a99b4a7b239b035319d450ce7c"},"id":"25b22c2b-cb58-46ef-85be-32296eb48283","version":3}'

RUN apt update && apt install -y  ca-certificates jq libgnutls30 && apt clean
RUN mkdir -p /root/.lpData/mainnet/keystore && \
  mkdir -p /root/.lpData/rinkeby/keystore && \
  mkdir -p /root/.lpData/devenv/keystore && mkdir -p /root/.lpData/offchain/keystore

COPY --from=jrottenberg/ffmpeg:4.0-ubuntu /usr/local /usr/local

COPY ${LIVEPEER_BINARY} /usr/bin
WORKDIR /root

ENV JSON_KEY=$JSON_KEY
# COPY store_key.sh .
# COPY wait-for-it.sh .
COPY start.sh .
RUN chmod +x start.sh
# RUN chmod +x store_key.sh
# RUN chmod +x wait-for-it.sh
#RUN ./store_key.sh
# RUN ./start.sh

EXPOSE 7935/tcp
EXPOSE 8935/tcp
EXPOSE 1935/tcp

ENTRYPOINT ["./start.sh"]
#CMD ["/usr/bin/livepeer"]
CMD ["--help"]

#ENTRYPOINT ["/usr/bin/livepeer"]
#CMD ["--help"]

#RUN chmod +x start.sh
#ENTRYPOINT ./start.sh

#FFS don't forget binding to 0.0.0.0 ,, ugh....
#docker run -p 8935:8935 lpnode -rinkeby -datadir /lpData -v 7 -httpAddr 0.0.0.0:8935 -cliAddr 0.0.0.0:7935
