# The Inox programming language


Inox is a concatenative script language. It is designed to operate in the context of edge computing, with the Internet of Things, in Machine Learning times. It will hopefully run on nodejs (first), wasm (second), micro controlers (esp32), etc.

It is a forth/smalltalk/erlang inspired stack based language with a virtual machine. The basic data element is a 64 bits cell made of two parts, a typed value and a name.

This is the Typescript reference implementation. It defines the syntax and semantic of the language. Production quality version of the virtual machine would have to be hard coded in some machine code to be more efficient.

I started working on it in june 2021. It's not working yet. The first implementation will run in a regular javascript virtual machine, nodejs, browsers, deno, etc.

Yours,

   Jean Hugues Noël Robert, aka Virteal Baron Mariani. @jhr on Twitter.

---
---
---

Why?
====

Keep reading only if you care about programming language design. You've been warned. Welcome.

The Inox programming language explores hopefully innovative features not found in mainstream languages like Javascript, C, Python or PHP. Some of Inox specificities do exist in more some more esoteric languages like Lisp, Forth, Smalltalk, etc. Some are radically new, until proven otherwise ;)

So, what's new?

Named values
------------

Every Inox value as a name attached to it. That name comes in addition to the classic type and value that most scripting languages provide.

Because values are named, using a tag, it becomes possible to access them using that name. This is similar to the indirect access that pointers provide but without the notion of identity normaly associated to objects. That is so because many values can have the same name whereas the identity of an object is necesseraly unique.

This is superficialy similar to the notion of property, attribute, field, instance variables, etc. But it has deeper additional consequences and usages.

Among other usages, Inox uses names to access variables in stacks. Most other languages use index insteads, a position in the stack. A position that is most often relative to the level of the stack when some function is entered/activated. This is the classical notions of activation record and local variables associated to function calls.

Because Inox access variables by names there is no need to provide a user friendly syntax to figure out the numerical position of a variable in a stack. Hence local variables in Inox are dynamically scoped, no lexical scope, not yet.

Inox also uses named values to implement control structures (if, loop, etc) without the computation of complex changes to the instruction pointer. It is still possible to manipule that instruction pointer to implements diverses form of branching (goto, jump, call, exceptions, etc) ahead of time, at compile time, but this is more an optimization than a natural way of expressing things using names instead of labels like in the dark age of assembler languages.

An Inox compiler is somewhere is the road map, we'll come to it somedays, just in time.


Hints
-----

Interpreters are slow, this is inevitable to some extend. That disadvange is compensated by some additionnal level of safety. No more dangling pointers, overflow/underflow, off by one back doors, eisenbugs that disappear when observed and all the drama of low level debugging, core dumps, viruses and unanticipated corner cases. Less pain.

Yet, no pain, no gain. If you dare, Inox lets you enter adventure land. You then giveup asserts, type checking, boundaries guards and maybe even dynamic memory management in exhange for speed. Up to C speed for those who are willing to take the risk.

Runtime checks are enabled/disabled at user's will, at run time potentially. This provides a speed boost that is well deserved when sufficient test coverage was conducted by the mature programmer using state of art technics.

Type checking at compile time is a mode that sustains the passage of time, it is not going to disappear soon. On the other end of the spectrum, script languages favor late binding and run time type identification. Let's try to unite these too often opposite preferences.

Syntax is also a matter of state. Inox is rather opiniated about that. To some reasonnable extend it provide mechanisms to alter the syntax of the language, sometimes radically. I thanks Forth for that :)

It is up to each programmer to apply the style he prefers, life is brief. There is more than one way to do it as they say in the wonderfull world of Perl. The principle of least surprise is cautios but girls love bad guys, don't they?

So, be surprised, be surprising, get inspirational if you can, endorse the Inox spirit!

Vive Inox ! Or else, stay calm and carry on, c'est la vie, a tale maybe.


Overview
========

Here is a short presentation of some of the main characteristics of the Inox programming language. There is no stable set of features yet but it gives some ideas about the general spirit of the language. Enjoy!


Words
=====

``` sh
to hello "hello" out.

hello
```

This defines a **word** named `hello`. Then the word is invoked and as a result `hello` is displayed on some output device.

Words take their parameters from a _data stack_. They can also push results onto that stack.

Word `to` starts a word _definition_ that an often optional `.` (dot) terminates. Inside that defintion there are other words and litteral values like numbers or pieces of text.

Note: a _word_ can be made of anything, not just letters. As a result `even?` is a valid name, it could be the name of a word that tests if a number is even. By convention words with a `?` are _predicates_, their result is a _boolean value_ that is either true or false.

`to say out. "hello" say`

As a convenience the word to invoke can be specified before the pushed data, using `( )` paranthesis.

`say( "hello" )`

`"hello" say`

It is the responsabily of whoever invokes a word to first push the parameters required by that word, in the proper order, in the proper number. Each word can define it's own _protocol_ about that.


Control structures
==================

 ``` sh
to play
  random-no( 100 )
  loop: {
    out( "Guess? ")
    read-line, text-to-integer,
    dup, if not integer? then: { drop,               continue }
    dup, if: >?          then: { out( "Too big"   ), continue }
    dup, if: <?          then: { out( "Too small" ), continue }
                                 out( "Yes!" ),      break
  }
  clear-data
```

This code is a small game where the player must guess a number between 0 and 100. It illustrates two important _control structures_: loops and _conditionnals_. `dup` duplicates the value on the top of the data stack whereas `drop` removes it while `clear-data` empties the entire stack.

`while: { ... } do: { ... }` and `do: { ... } until: { ... }` are special versions of the more general `loop: { ... }` structure where the loop breaks or continue depending on some condition.


Functions
=========

Functions are special words that name their parameters to access them in an easier way than is possible from the data stack.

``` sh
to tell-to/  with /msg /dest  function: {
  out( "Tell " & |msg & "to " & |dest )
}

tell-to/( "Hello", "Alice" )
```


By convention the name of functions terminates with a `/` that means _applied on_. When the function is invoked, it's actual arguments are moved from the _data stack_ to another stack named the _control stack_.

The `{}` enclosed _block_ that defines the function can then access the arguments, using the name of the corresponding formal parameter with a `|` (pipe) prefix. This is the syntax for _local variables_ too.

`&` is an operator that joins two pieces of text found on the data stack.


```
to tell-to/ w/ /m /d f{ out( "T " & |m & "t " && |d }
```

This is an abbreviated syntax that is defined in the _standard library_. `f{ ... }` is like `f( ... )` but the former invokes the `f{` word with the block as sole parameter whereas the later invokes the word `f` when `)` is reached with the parameters on the stack.


Assertions
==========

```
assert{ check_xxx }
```

Assertions are conditions to expect when things go normally, ie with no bugs. Assertions before something are called _pre conditions_ whereas assertions after something are called _post conditions_. This is usefull to detect bugs early.

Note: the word `assert{` does not evaluate it's block parameter when running in _fast_ mode. Hence there is little overhead involved to keep lots of assertions even when the code is ready for production. Who knows, they may prove valuable later on when some maintenance breaks something. It's like tests, but inline instead of in some independant test suite.

The default definition of `assert{` use the `inox-FATAL` primitive. However it uses it via an indirection by the `FATAL` word.


Word redefinition
=================

```
to FATAL  /FATAL-hook call-by-tag.  ~~ late binding
```

This kind of late binding makes it easy to hook some new code to old word definition. Without those indirections there would be no solution for old words to use redefined words. That's because redefined word definition impact words defined after the redefinition only, the old word keep using the older definition.

```
to FATAL-hook handle-it-my-way.
```

The default implementation use `inox-FATAL`. That primitive displays a stack trace and then forces the exist of the Inox process. This is brutal but safe when Inox processes are managed by some orchestration layer. One that will automatically restrart the dead process for example.


Blocks
======

Blocks are sequence of _words_.

``` sh
to tell-sign  if-else( <0?, { out( "negative" ) }, { out( "positive" ) }.

-1 tell-sign  ~~ outputs negative

tell-sign( -1 ) ~~ idem`
```

Two consecutive `~~` (tildes) introduce a comment that goes until the end of the line. Use `~|` and `|~` for multi lines comments.


Keywords
========

```sh
to say:to:  swap " " prefix prefix out().

say: "Hello" to: "Bob";
```

Keywords are multi parts words with a `:` (colon) after each part and a final `;` (dot comma).

`swap` is a predefined word that swaps the value at the top of the data stack with the next value on that stack. `prefix` is somehow like the `&` operator but it joins the two pieces of text in reverse order so that the second becomes the prefix of the first one on the final text result.

```sh
to tell-sign
  if: <0? then: {
    out( "negative" )
  } else: {
    out( "positive )
  }
```

`if:then:else:` is a keyword. It is predefined. If it were not, it could easly be defined using the `if-else` word.

```
to if:then:else  if-else
```

`if-else` is a word that expects to find three parameters on the data stack: a boolean value and two blocks. Depending on the boolean, it runs either the first or the second block.

``` sh
to tell-sign <0? { "negative" out } { "positive" out } if-else
```

This definition of the word `tell-sign` uses a style that is unusual, it is a postfix notation. This is compact but sometimes difficult to read. Depending on your preferences you may use either that postfix style, a classical function call style or the multi parts keyword style.


Variables
=========

Data variables
--------------

Data variables have their value stored in the _data stack_. To retrieve such a value it should first be pushed with a proper name and than later on retrieve using that name with a `_` prefix.

``` sh
x:3 y:5 out( "Point x: " & _x & ", y: " & _y )  ~~ outputs Point x:3, y:5

3 x_
```

To push such a data variable onto the data stack, it's initial value can also be taken from the top of the data stack itself using the syntax `xyz_`. It reads _"store the top of the data stack into data variable xyz"_ or _"rename xyz the value at the top of the data stack"_.

```
3 x_
```

Local variables
---------------

``` sh
to say-to/  (| dest| msg|
  out( "Say" & |msg & " to " & |dest
|)
```

Local variables are variables stored into another stack, the _control stack_. Syntax `|xyz` creates such variables using the value at the top of the data stack. It reads _"pop the top of the data stack to create the local variable x"_. One uses `|xyz` to retrieve the value of the local variable. It reads _"get local variable x"_.

To set the value of a local variable using the top of the stack, use `|xyz!`. `!` (exclamation point) means "set" in this context and by convention it means _"some side effect or surprise involved"_ is a more general sense.

``(|`` and `|)` specify respectively the begining and the end of the **scope** within which local variables are created and used. These scopes can nest in such a way that a local variable created by a word can be accessed from the other words invoked while the scope exists, unless that word created another local variable with the same name.

This type of scoping for variables is named _"dynamic"_ by opposition to the more frequent static style named _"lexical"_ where a local variable stays purely local to the function that created it. Note: changing the value of a local variable outside the word that created it is usually considered _"harmful"_ and should be avoided.


Object variables
----------------

**Object variables** are stored inside a stack that belongs to an object.

```
x:3 y:2 point:2 make-object  ~~ create a point object with two variables.
```

Access to an object's variables requires two informations: the name of the variable and the identity of the object.

The `make-object` word creates an object and pushes it's identity onto the data stack. It gets as parameters the **class** of the object and the number of object variables to initialize with values poped from the data stack.

```
to make-point  make-object( x:0, y:0, point:2 )

make-point, 2 _point.x!, 5 _point.y!, out( "x is " & _point.x )
```

With the object class and the object variable, it becomes easy to define **method words** that manipulate the object.

```
to point.dump  method: { out( "( x:" & it.x & ", y: " & it.y & ")" ) }.
```

Such method words are typically defined using the `method:` word. It creates a local variable named **it** and then it runs the specified block. Some other language use _self_ or _this_ instead of _it_.

Values
======

Values are simple things such as `1`, `"hello"`, `/msg` or the identity of some object, or some more complex values, made of multiple simple values.

Each value, either simple or complex, has a type and a name attached to it. These **named values** are often more convenient to manipulate than the classical anonymous values found in most computer languages.

There are a few special values, including _falsy_ values such as `0`, `void` or `""` (the empty text) that are often usefull when a _boolean_ value is expected.

Constants are words that push a specific value onto the data stack, like `true`, `false` and `void` that push `1`, `0` and `void` respectively.

`void` is a very special value that often means that there is no valid value available. It could be the result of the failed attempt to find something for example.


Tags
====

```
x:1  ~~ an integer value named x

msg:"hello"  ~~ a text value name msg
```

It is as if a tag were attached to the value, hence such names for values are called **tags**.

``` sh
"rectangle" /label rename, dump out ~~ outputs label:"rectangle"
```

`/xxx` is the syntax to designate a tag. `"xxx"` designates a text. `1.0` or `1f` designate floating numbers. `-1` is the negative one number.

Whereas objects have a life cycle (created, used, forgotten), tags exists forever, like numbers, like any value actually, in abstraction. To turn a text into a tag, use `tag( text )`. Use `tag-to-text( tag )` to do the opposite. Some computer languages use a different terminology like _atom_ or _symbol_ but it means the same thing.

Objects have a value and an identity. The value is made of the class of the object and it's variables stored in a stack that belongs to the object. Contrary to values, object are referenced indirectly using **pointers**. A pointer is a type of value that holds the identity of some object.


The class hierarchy
-------------------

Every thing is something, hence **thing** is the base class of everything else, both values and objects. Values have a name and a type whereas objects have an identity and a value also made of more or less simple multiple values (object variables), potentially including pointer values when objects references each others. By convention the name of the value of a object is named it's _class_.

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

Sometimes some things have a class that is the combination of multiple base classes. For example a text and an array are both iterable things even thougth one is a value whereas the other one is an object made of multiple values.

One important distinction is when comparing two things. If both things are compared _by value_ then the _=?_ operator should be invoked. If things are objects, it is generaly the identity that matters and the _==?_ operator should be invoked. This is _by reference_ instead of _by value_. When communicating, two entities must agree on weither they communicate informations by value or by reference.


Stacks
======

_stacks_ are lists of values with an easy access to the value at the top of the stack or nearby.


The data stack
--------------

The _data stack_ is of special importance because it is throught it that the information flows from words to words.

Most of the time words operate on the values at the top of stack, including the one at the very top sometimes called _"TOS"_, short for Top Of the Stack. The next value, below the top, could be _"NOS"_ for Next On Stack.

Operators are words that typically use TOS (unary operators) and sometimes TOS and NOS (binary operators) to produce a result.

```
3 2 + out ~~ outputs 5

out( 3 + 2 ) ~~ Idem, with an "infix" notation instead of "postfix"
```

It is very common and advised to break long words into smaller words with good names. This makes the source code easy to understand. Words must be defined before they are used. As a result it is common to first define words for some special vocabulary and then use these simple words to solve a bigger problem.


The control stack
-----------------

The _control stack_ is for _control structures_ like loops, conditional branches or nested word invocations. It is also used to store _local variables_ like for instance an `ii` variable that is used as an indice when adressing the elements of a list of values or similar data structures.

When the definition of a word requires the execution of another word, or the application of a function, as most words do, the position inside the current word is stored onto the control stack. It is later retrieved there when the execution of the nested word is finished and when control needs to get back to the previous word.

```
to fib if: ( dup >? 2 ) then: { fib( dup - 1 ) + fib( swap - 2 ) }

out( fib( 10 ) ) ~~ outputs the 10th number of the fibonacci suite
```

In this example, `dup` duplicates the TOS (Top Of the Stack) and `swap` swaps it with the NOS (Next On Stack). Dealing this way with the stack can become rather accrobatic and using functions produces a solution that is more readable.

```
to fib/  with /n function: {
  if |n >? 2 then: {
    fib/( |n - 1 ) + fib/( |n - 2 )
    }
  }
 ```

Note: if the current word is the last word of a definition, using `again` instead is a better solution because it avoids a potential overflow of the control stack. This classic optimisation is called _"tail call elimination"_ and it is done by the Inox compiler (ToDo).

Unfortunately it does not apply to the fidonacci function because the actual last word of the definition is the `if` word. This is clearly visible in the postfix notation only.

```
to fib dup, 2 >? { dup, 1 - fib, swap, 2 - fib, + } if.
```

Note: the `,` (comma) is purely cosmetic, it is just there to make the source code clear, somehow.

Another style is possible using named values in the data stack.

```
to fib if: _nth >? 2 then: { fib( _nth - 1 ) + fib( _nth - 2 ) }.

out( fib( nth:10 ) ) ~~ However the parameter now needs to be named
```

Other stacks
------------

A stack is fairly usefull data structure and it is easy to create one using an array of values whose size grows and shrinks when values are pushed onto it and popped from it.

``` sh
make-stack
"hello " _stack.push,
"world!" _stack.push,
out( _stack.pop & stack.pop )

~~ it outputs world!hello , out( _stack.pop _stack.pop prefix ) would produces hello world! instead.
```

Note : the result of `make-stack` is a _pointer_ value named `stack`, this is the reason why `_stack` easely finds it inside the data stack.


Dialects
========

Inox was designed to be extensible. It supports multiple dialects in addition to it's own dialect. The Forth language was a primary source of inspiration. This is why a Forth dialect is proposed.

``` sh
forth-dialect ( speaks Forth )  : HELLO ." Hello" ; HELLO

inox-dialect ~| speaks Inox |~  to Hello  out( "Hello" ). Hello
```


Aliases
=======

Whenever a word is detected, if some alias for it exists then the word is replaced by it. This is a very basic form of macro processing of the source code, with substitution. A full macro system, like the one of m4, a super set of C's one, is somewhere in the road map; that or something else.

Until then only `alias` is defined.

``` sh
alias( "Define", "to" )  ~~ assuming I prefer to use Define instead of "to".
```

Each dialect has it's own dictionary of _aliases_ that make it easy to change the source code appearence when needed.

``` sh
inox-dialect, alias( "defn", "to" )
defn Hello-world  ( "Hello" out )
( hello )
```

Contrary to _aliases_, words defined in one dialect are available is all the other ones.

To create a new dialect, simply swith to it. Then it is a matter of words, methods of object, syntaxic aliases and some advanced technics yet to be fully described.

```
/MyDialEct dialect, alias( "Fun", "to" )
Fun HeLlO  "WorLD" out
HeLlo
```


missing-word
------------

When some dynamic construct attempts to execute an undefined _word_, `missing-word` is invoked instead. The stack contains either a tag or a text, depending on how the word was invoked, by text name or by tag name.

It is then possible to dynamiccaly implement the proper behaviour of the undefined word.


missing-method
--------------

A _method_ is a word of a certain class, the class of the thing it is applied against. Such words have a syntax with a dot that separates the name of the class from the rest of the word.

When the target thing does not not understand a word, `missing-method` is invoked instead. The stack contains the target thing plus a tag or a text about the word, much like with `missing-word`.


missing-operator
----------------

_Operators_ are special words that help to write code in the infix notation. At this time (january 2023) there is no precedence and only left association. But this is expected to evolve with multiple precedences, right associativity and possibly ternary operators.


Actors
======

Actors are active objects that communicate the ones with others using _messages_.

Whereas a passive objects execute locally a word definition when told to do so and suspend the invoker until done, active objects run words in parallel. Sometimes it is inside the same machine, either a virtual Inox machine or a physical machine. Sometimes it is inside distant machines, with messages transmitted over a network.

Actors are necessary for distributed computing and usefull for asynchronous programming. They are utilized for both purposes often. Actors receive messages from a queue, their _data stack_, and send messages to other actors that they know about either because they created them or because they knew about them by querying some registry.

Like objects, actors have an identity, a class and variables that define their
_state_. However each actor runs in a different thread of execution. Using objects you play solo, with actors it's an orchestra!


Orchestration
=============

The grand plan is to built an orchestration solution on top of Inox defined actors. Such a control plane would automaticcaly restart failing actors, allocate ressources wisely, control hot reloads and migrations, etc.

This is not at all available yet. Please don't use Inox in production.


Conclusion
==========

None yet. _That's all folk!_

BTW: there are many bugs in the sample code, can you spot them?
