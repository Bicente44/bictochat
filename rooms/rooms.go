/* 
 * Rooms.go
 * Manages the state and owns the data. Controls the access of the Rooms.
 */

package rooms

import (
	"time"
	"sync"
	"errors"
)


var Store = RoomStore{
    Rooms: make(map[string]Room),
}

/* Structs */
type RoomStore struct {
    Mu sync.Mutex
    Rooms map[string]Room
}

type Message struct {
	Drawing string
	Sender string
	TimeSent time.Time
}

type Client struct {
	UserID int
	UserName string
	LastSeen time.Time
}

type Room struct {
	ClientList []Client
	MessageList []Message
}

type RoomInfo struct {
    RoomID string `json:"roomID"`
    Count  int    `json:"count"`
}

// Does not return anything because it directly modifies the data
func (st *RoomStore) InitRooms() {
	roomIDs := []string{"A", "B", "C", "D", "E", "F", "G", "H"}
	for _, roomID := range roomIDs {
		st.Rooms[roomID] = Room {
			ClientList:  []Client{},
    		MessageList: []Message{},
		}
	}
}

func (st *RoomStore) JoinRoom(roomID string, username string) error {

	st.Mu.Lock()
	defer st.Mu.Unlock() 

	room, exists := st.Rooms[roomID]
	if !exists {
		return errors.New("room does not exist")
	}
	if len(st.Rooms[roomID].ClientList) > 3 {
		return errors.New("room is full")
	}

	newClient := Client {
		UserID: len(room.ClientList),
		UserName: username,
		LastSeen: time.Now(),
	}
	room.ClientList = append(room.ClientList, newClient) // add client
	st.Rooms[roomID] = room // save

	return nil
}

func (st *RoomStore) AddMessage(roomID string, newMessage Message) error {
	st.Mu.Lock()
	defer st.Mu.Unlock()
	
	room, exists := st.Rooms[roomID]
	if !exists {
		return errors.New("room does not exist")
	}
	room.MessageList = append(room.MessageList, newMessage) // add client
	st.Rooms[roomID] = room // save

	return nil
}

func (st *RoomStore) GetMessage(roomID string) ([]Message, error) {
	st.Mu.Lock()
	defer st.Mu.Unlock()
	
	room, exists := st.Rooms[roomID]
	if !exists {
		return nil, errors.New("room does not exist")
	}
	return room.MessageList, nil
}

func (st *RoomStore) GetRooms() []RoomInfo {
	var result []RoomInfo

	st.Mu.Lock()
	defer st.Mu.Unlock()

	for id, room := range st.Rooms {
		result = append(result, RoomInfo{
			RoomID: id,
			Count:  len(room.ClientList),
		})
	}
	return result
}

// lock, check exists, rebuild slice without the leaving client, save, return nil.
func (st *RoomStore) LeaveRoom(roomID string, username string) error {
	var updated []Client
	st.Mu.Lock()
	defer st.Mu.Unlock()

	room, exists := st.Rooms[roomID]
	if !exists {
		return errors.New("room does not exist")
	}
	for _, client := range room.ClientList {
		if client.UserName != username {
			updated = append(updated, client)
    	}
	}
	room.ClientList = updated
	st.Rooms[roomID] = room
	return nil
}

func (st *RoomStore) StartCleanup() {
	// Iterate through all the rooms
	for {
		st.Mu.Lock()
		for roomID, room := range st.Rooms {
			var active []Client
			for _, client := range room.ClientList {
				if time.Since(client.LastSeen) <= 60*time.Second {
					// Add client to active list
					active = append(active, client)
				}
			}
			room.ClientList = active
			st.Rooms[roomID] = room
		}
		st.Mu.Unlock()
		time.Sleep(10 * time.Second)
	}
}

func (st *RoomStore) UpdateLastSeen(roomID string, username string) {
	st.Mu.Lock()
	defer st.Mu.Unlock()

	room, exists := st.Rooms[roomID]
	if !exists {
		return 
	}
	for i := range room.ClientList {
		if room.ClientList[i].UserName == username { 
			room.ClientList[i].LastSeen = time.Now()
		}
	}
	room.ClientList = room.ClientList
	st.Rooms[roomID] = room
}
