all: up

up:
	@echo "Building containers ..."
	@docker compose up --build

stop:
	@echo "Stopping containers ..."
	@docker compose stop

down:
	@echo "Downing containers ..."
	@docker compose down -v

clean: down
	@echo "Cleaning up ..."
	@docker system prune -f

fclean: clean
	@docker system prune -af --volumes

re: fclean all

.PHONY: all up stop down clean fclean re mobile-keystore mobile-install mobile-debug mobile-release mobile-clean mobile-sha1
