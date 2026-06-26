/* 
 * main.go
 * 
 * This is the entrypoint, it has 3 jobs.
 * Register routes (on given client request route them. say join then call handler function)
 * Serve static files (view)
 * Listen to port
 */

package main

import (
	"net/http"
	"log"
	"bicente44.app/bictochat/handlers"
	"bicente44.app/bictochat/rooms"
)

func main() {
	mux := http.NewServeMux() // Multiplexer (request router)
	
	// Serve static files
	mux.Handle("/", http.FileServer(http.Dir("static")))
	
	rooms.Store.InitRooms()

	// Register ports
	mux.HandleFunc("/join", handlers.JoinHandler)			// Join
	mux.HandleFunc("/send", handlers.SendHandler)			// Send
	mux.HandleFunc("/poll", handlers.PollHandler)			// Poll
	mux.HandleFunc("/rooms", handlers.RoomsHandler)			// Rooms
	// TODO Handle 404 in the future

	// opens the port, hands requests to the mux and listens
	log.Fatal(http.ListenAndServe(":8080", mux))
}

