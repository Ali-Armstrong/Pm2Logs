/**
 * Created by sys1108 on 29/1/18.
 */
var socket = io.connect(window.location.host);

socket.emit("add-user", {"username": userEmail});

socket.on("result",function(data){
    //console.log("client side..",data);
    $("pre").append(data);
    autoscroll()
});

socket.on("redirect",function () {
    window.location = "logs23.way2target.com"
});

function myfunction(a)
{
    if(a.charCode==13 || a.keyCode==13)
    {
        data();
    }
}

function autoscroll() {
    var elem = document.getElementById('result');
    elem.scrollTop = elem.scrollHeight;
}

function data() {
    var x=document.getElementById('search').value;
    $("pre").text('');
    socket.emit("kill");
    // socket = io.connect(window.location.host);
    socket.emit("search",{"query":x,"username":userEmail});
    //console.log(x)
}

function logout() {
    socket.emit('kill');
    socket.emit('end',{"username":userEmail});
    userEmail=null;
}

function kill() {
    socket.emit('kill');
}