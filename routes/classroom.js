function initClassroom(io){
  io.on('connection', (socket)=>{
    socket.on('class:join', ({ code, role })=>{
      socket.join('class:'+code);
      socket.emit('class:event', { action:'joined', code, role });
    });
    socket.on('class:start', ({ code })=>{
      socket.join('class:'+code);
      io.to('class:'+code).emit('class:event', { action:'started', code, ts: Date.now() });
    });
    socket.on('class:event', (payload)=>{
      const code = payload.code;
      io.to('class:'+code).emit('class:event', payload);
    });
  });
}
module.exports = { initClassroom };
