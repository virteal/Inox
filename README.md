[![Netlify Status](https://api.netlify.com/api/v1/badges/d4d3fa7e-d9ff-407e-b750-9c41e038c006/deploy-status)](https://app.netlify.com/sites/inox/deploys)



# Inox

Inox is a concatenative script language. It's syntax is basic. It is designed to operate in the context of edge computing, in the Internet of Things, in ML times. It will hopefully run on nodejs (first), wasm (second), metal, micro controlers (esp32), etc.

It is a basic/forth/smalltalk/erlang inspired stack based language. The basic data element is a 64 bits cell made of two parts, a value and a name.

This is the typescript reference implementation. It defines the syntax and semantic of the language. Production quality version of the virtual machine would have to be hard coded in some machine code to be more efficient.

I started working on it at the beginning of june 2021. It's not working at all yet. The first implementation will run in a regular javascript virtual machine, nodejs, browsers, deno, etc.

Yours,

   Jean Hugues Noël Robert, aka Virteal YanUg, aka Baron Mariani. @jhr on Twitter.
