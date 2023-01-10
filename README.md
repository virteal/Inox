# The Inox programming language

Inox is a concatenative script language. It is designed to operate in the context of edge computing, in the Internet of Things, in ML times. It will hopefully run on nodejs (first), wasm (second), metal, micro controlers (esp32), etc.

It is a basic/forth/smalltalk/erlang inspired stack based language. The basic data element is a 64 bits cell made of two parts, a typed value and a name.

This is the typescript reference implementation. It defines the syntax and semantic of the language. Production quality version of the virtual machine would have to be hard coded in some machine code to be more efficient.

I started working on it at the beginning of june 2021. It's not working at all yet. The first implementation will run in a regular javascript virtual machine, nodejs, browsers, deno, etc.

Yours,

   Jean Hugues Noël Robert, aka Virteal, aka Baron Mariani. @jhr on Twitter.

# Overview

Here is a short presentation of some of the main characteristics of the Inox programming language. This is not a stable set of features but it gives some ideas about the general spirit of the language. Enjoy!

# Words

`to hello "hello" out.`

`hello`

This defines a **word** named `hello`. Then the word is invoked and `hello` is written to some output device.

Words take their parameters from a _data stack_. They can also push results onto that stack.

`to say out. "hello" say`

As a convenience the word to invoke can be specified before the pushed data, using `( )` paranthesis.

`say( "hello" )`

`"hello" say`

It is the responsabily of whoever invokes a word to first push the parameters required by that word, in the proper order, in the proper number.

# Functions

Functions are special words that name their parameters to access them in an easier way then from the data stack.

`to tell-to/ with /msg /dest function: { out( "Tell " & |msg & "to " & |dest ) }.`

`tell-to/( "Hello", "Alice" )`

By convention the name of functions terminates with a `/` that means _applied on_. When the function is invoked, it's actual arguments are moved from the _data stack_ to another stack named the _control stack_. The `{}` enclosed _block_ that defines the function can then access the arguments using the name of the corresponding formal parameter with a `|` (pipe) prefix. This is the syntax for _local variables_ too.

`&` is an operator that joins two pieces of text found on the data stack.

# Blocks

Blocks are sequence of _words_.

`to tell-sign if-else( <0?, { out( "negative" ) }, out( "positive" ).`

`-1 tell-sign ~~ outputs negative`

`tell-sign( -1 ) ~~ idem`

Two consecutive `~~~` (tildes) introduce a comment that goes until the end of the line. Use `~|` and `|~` for multi lines comments.

# Keywords

`to say:to: swap " " prefix prefix out().`

`say: "Hello" to: "Bob";`

Keywords are multi parts words with a two points punctuation after each part and a final `;` (dot comma).

`swap` is a predefined word that swaps the value at the top of the data stack with the next value on that stack. `prefix` is like the `&` operator but it joins the two pieces of text in reverse order so that the second becomes the prefix of the first one on the final text result.

`to tell-sign if: <0? then: { out( "negative" ) } else: { out( "positive ) }.`

`if:then:else:` is a keyword. It is predefined. If it were not, it could easly be defined using the `if-else` word.

`to if:then:else if-else`

`if-else` is a word that expects to find three parameters on the data stack: a boolean value and two blocks. Depending on the boolean, it runs either the first or the second block.

`to tell-sign <0? { "negative" out } { "positive" out } if-else.`

This definition of the word `tell-sign` uses a style that is unusual, it is a postfix notation. This is compact but sometimes difficult to read. Depending on your preferences you may use either that postfix style, a classical function call style or the multi parts keyword style.

# Variables

## Data variables

**data variables** have their value stored in the _data stack_. To retrieve such a value it should first be pushed with a proper name and than later on retrieve using that name with a `_` prefix.

`x:3 y:5 out( "Point x: " & _x & ", y: " & _y ) ~~ outputs Point x:3, y:5`

`3 x_`

To push such a data variable onto the data stack, it's initial value can also be taken from the top of the data stack itself using the syntax `xyz_`. It reads _"store the top of the data stack into data variable xyz"_ or _"rename xyz the value at the top of the data stack"_.

`3 x_`

## Local variables

**local variables**

`to say-to (| dest| msg| out( "Say" & |msg & " to " & |dest |)`

Local variables are variables stored into another stack, the _control stack_. Use syntax `|xyz` to create such a variable using the value at the top of the data stack. It reads _"pop the top of the data stack to create the local variable x"_. Then use `|xyz` to retrieve the value of the local variable. It reads _"get local variable x"_. To set the value of a local variable using the top of the stack, use `|xyz!`. `!` (exclamation point) means "set" in this context and it means _"some side effect involved"_ is a more general sense.

``(|`` and `|)` specify respectively the begining and the end of the **scope** within which local variables are created and used. Such scopes can nest in such a way that a local variable created by a word can be accessed from the other words invoked while the scope exists. This type of scoping for variables is named _"dynamic"_ by opposition to the more frequent static scope named _"lexical"_ where a local variable stays purely local to the function that created it.

## Object variables

**Object variables** are stored inside a stack that belongs to an object.

`x:3 y:2 point:2 make-object ~~ create a point object with two variables.`

Access to an object variables requires two informations: the name of the variable and the identity of the object. The `make-object` word creates an object and pushes it's identity onto the stack. It gets as parameters the **class** of the object and the number of object variables to initialize with values poped from the data stack.

`to make-point make-object( x:0 y:0 point:2 ).`

`make-point, 2 _point.x!, 5 _point.y!, out( "x is " & _point.x )`

With the object class and the object variable, it becomes easy to define **method word** that manipulate the object.

`to point.dump method: { out( "( x:" & it.x & ", y: " & it.y & ")" ) }.`

Such method words are typically defined using the `method:` word. It creates a local variable name **it** and then it runs the specified block. Some other language use _self_ or _this_ instead of _it_.

# Values

Values are such simple things as `1`, `"hello"`, `/msg` or the identity of some object, or some more complex values made of multiple simple values. Each value, either simple or complex, has a type and a name attached to it. These **named values** are often more convenient to manipulate than the classical anonymous values found in most computer languages.

`x:1 ~~ an integer value named x`

`msg:"hello" ~~ a text value name msg`

It is as if a tag were attached to the value, hence such names for values are called **tags**.

`/label "rectangle" rename, dump ~~ outputs label:"rectangle"`

`/xxx` is the syntax to designate a tag. `"xxx"` designate a text. `1.0` or `1f` designate a floating number. `-1` is negative one number.

Whereas objects have a life cycle (created, used, forgotten), tags exists forever, like numbers, like any value actually, in abstraction. To turn a text into a tag, use `tag( text )`. Use `tag_to_text( tag )` to do the opposite. Some computer languages use a different terminology like _atom_ or _symbol_ but it means the same thing.

Objects have a value and an identity. The value is made of the class of the object and it's variables stored in a stack that belongs to the object. Contrary to values, object are referenced indirectly using **pointers**. A pointer is a type of value that holds the identity of some object.

## Class hierarchy

Every thing is something, hence **thing** is the base class of everything else, both values and objects. Values have a name and a type whereas objects have an identity and a value made of more or less simple multiple values (object variables), potentially including pointer values when objects references each others.

`class( |xxx ) ~~ get the class of the thing in the xxx local variable.`

- `thing`
  - `value`
    - `void`
    - `tag`
    - `integer`
    - `float`
    - `text`
    - `pointer`
    - `word`
   - `object`
     - `native`
     - `proxy`
     - `array`
     - `map`

Sometimes some things have a class that is the combination of multiple base classes. For example a text and an array are both interable even thougth one is a value whereas the other one is an object made of multiple values.

One important distinction is when comparing two things. If both things are compared _by value_ then the _=?_ operator should be invoked. If things are objects, it is generaly the identity that matters and the _==?_ operator should be invoked. This is _by reference_ instead of _by value_. When communicating, two entities must agree on weither they communicate informations by value or by reference.

# Actors

Actors are active objects that communicate the ones with others using messages.

Whereas a passive objects execute locally a word definition when told to do so and suspend the invoker until done, active objects run words in parallel. Sometimes it is inside the same machine, either a virtual Inox machine or a physical machine. Sometimes it is inside distant machines, with messages transmitted over a network.

Actors are necessary for distributed computing and usefull for asynchronous programming. They are utilized for both purposes often. Actors receive messages from a queue and send messages to other actors that they know about either because they created them or because they knew about them by querying some registry.

Like objects, actors have an identity, a class and variables that define their
_state_. However each actor runs in a different thread of execution.
