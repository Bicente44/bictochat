package handlers

import (
	"bicente44.app/bictochat/rooms"
	"net/http"
	"encoding/json"
	"time"
)

type MessageRequest struct {
	RoomID   string `json:"roomID"`
    Username string `json:"username"`
    Drawing  string `json:"drawing"`
}

func JoinHandler(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("roomID")
	username := r.URL.Query().Get("username")

	if roomID == "" || username == "" {
		http.Error(w, "Missing roomID or username", http.StatusBadRequest)
		return
	}

	err := rooms.Store.JoinRoom(roomID, username)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func SendHandler(w http.ResponseWriter, r *http.Request) {
	var req MessageRequest

	err := json.NewDecoder(r.Body).Decode(&req)
    if err != nil {
        http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
        return
    }
	msg := rooms.Message{
		Drawing:  req.Drawing,
		Sender:   req.Username,
		TimeSent: time.Now(),
	}
	err = rooms.Store.AddMessage(req.RoomID, msg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func PollHandler(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("roomID")
	
	messages, err := rooms.Store.GetMessage(roomID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

func RoomsHandler(w http.ResponseWriter, r *http.Request) {
	roomList := rooms.Store.GetRooms()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(roomList)
}
