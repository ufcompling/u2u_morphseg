# Start everything from scratch for backend
py-setup: build up setup

# Build the images
build:
	docker compose build

# Start containers in the background
up:
	docker compose up -d

# Run the wheel build script inside the container
setup:
	docker exec -it TurtleShell ./setup.sh

# Stop the container
stop:	
	docker compose stop

# Stop and remove containers
clean:
	docker compose down

# View logs
logs:
	docker logs -f TurtleShell
