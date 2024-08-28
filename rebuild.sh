sudo docker build -t line-bot-gpt .
sudo docker run -dp 8111:8111 --env-file .env line-bot-gpt

