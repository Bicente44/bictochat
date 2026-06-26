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
