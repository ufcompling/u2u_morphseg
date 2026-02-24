# Default command
all: wheel-build

# Rebuilds the image and runs a fresh build
wheel-build:
	docker compose build
	docker compose run --rm buildwheel

# Just run the factory (assumes image is already built)
run-factory:
	docker compose run --rm buildwheel

# Stop everything and wipe volumes
clean:
	docker compose down -v
	rm -rf dist/
	rm -rf temp-crfsuite/

# logs check
logs:
	docker compose logs -f buildwheel