const SocketIO = require('socket.io');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cookie = require('cookie-signature');

module.exports = (server, app, sessionMiddleware) => {
  const io = SocketIO(server, { path: '/socket.io' });
  app.set('io', io);
  const room = io.of('/room');
  const chat = io.of('/chat');

  io.use((socket, next) => {
    cookieParser(process.env.COOKIE_SECRET)(socket.request, socket.request.res, next);
    sessionMiddleware(socket.request, socket.request.res, next);
  });

  room.on('connection', (socket) => {
    console.log('room 네임스페이스에 접속');
    socket.on('disconnect', () => {
      console.log('room 네임스페이스 접속 해제');
    });
  });

  chat.on('connection', (socket) => {
    console.log('chat 네임스페이스에 접속');
    const req = socket.request;
    const { headers: { referer } } = req;
    const roomId = referer
      .split('/')[referer.split('/').length - 1]
      .replace(/\?.+/, '');
    socket.join(roomId);

    axios.post(`http://localhost:8005/room/${roomId}`,{type : 'join', sid:socket.id,},{
      headers:{ Cookie : 'connect.sid=s%3A'+`${cookie.sign(req.signedCookies['connect.sid'], process.env.COOKIE_SECRET)}`,},
    });
    /*
    socket.to(roomId).emit('join', {
      user: 'system',
      chat: `${req.session.color}님이 입장하셨습니다.`,
      num : socket.adapter.rooms[roomId].length,
    });*/

    socket.on('disconnect', () => {
      console.log('chat 네임스페이스 접속 해제');
      socket.leave(roomId);
      const currentRoom = socket.adapter.rooms[roomId];
      const userCount = currentRoom ? currentRoom.length : 0;
      if (userCount === 0) { // 유저가 0명이면 방 삭제
        const signedCookie = cookie.sign(req.signedCookies['connect.sid'], process.env.COOKIE_SECRET);
        const connectSID = `${signedCookie}`;
        axios.delete(`http://localhost:8005/room/${roomId}`, {sid:socket.id},{
          headers: {
            Cookie: `connect.sid=s%3A${connectSID}`
          } 
        })
          .then(() => {
            console.log('방 제거 요청 성공');
          })
          .catch((error) => {
            console.error(error);
          });
      } else {
        axios.post(`http://localhost:8005/room/${roomId}`,{type : 'exit',sid:socket.id,},{
      headers:{ Cookie : 'connect.sid=s%3A'+`${cookie.sign(req.signedCookies['connect.sid'], process.env.COOKIE_SECRET)}`,},
     });
        /*
        socket.to(roomId).emit('exit', {
          user: 'system',
          chat: `${req.session.color}님이 퇴장하셨습니다.`,
          num : socket.adapter.rooms[roomId].length,
        });*/
      }
    });
    socket.on('chat', (data) => {
      socket.to(data.room).emit(data);
    });
    socket.on('dm', (data)=>{
      socket.to(data.sid).emit('dm', data);
    });
    socket.on('kick', (data)=>{
      socket.to(data.sid).emit('kick', data);
    });
  });
};