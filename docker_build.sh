#!/usr/bin/env bash

SERVICE_NAME="apiway-schedule"
TAG=$1
AWS_CONTAINER_REGISTRY="539277938309.dkr.ecr.us-west-2.amazonaws.com"


aws ecr get-login --region us-west-2 --no-include-email > ecr_login.sh
chmod +x ecr_login.sh
./ecr_login.sh

docker build -t $SERVICE_NAME:$TAG .
docker tag $SERVICE_NAME:$TAG $AWS_CONTAINER_REGISTRY/$SERVICE_NAME:$TAG
docker push $AWS_CONTAINER_REGISTRY/$SERVICE_NAME:$TAG
kubectl set image deployment/$SERVICE_NAME $SERVICE_NAME=$AWS_CONTAINER_REGISTRY/$SERVICE_NAME:$TAG
kubectl rollout status deployment/$SERVICE_NAME
kubectl delete pods -l name=$SERVICE_NAME

rm -f ecr_login.sh
