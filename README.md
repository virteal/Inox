# The Iɴᴏx programming language


Iɴᴏx is a concatenative script language. It is designed to operate in the context of edge computing, with the Internet of Things, in Machine Learning times. It will hopefully run on nodejs (first), wasm (second), micro controlers (esp32), etc.

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

The Iɴᴏx programming language explores hopefully innovative features not found in mainstream languages like Javascript, C, Python or PHP. Some of Iɴᴏx specificities do exist in some more esoteric languages like Lisp, Forth, Smalltalk, etc. Some other specifities are radically new. Well... until proven otherwise that is ;)

So, what's new?

Named values
------------

Every Iɴᴏx value as a name attached to it. That name comes in addition to the classic type and value that most languages provide.

Because values are named, using a tag, it becomes possible to access them using that name. This is similar to the indirect access that pointers provide but without the notion of identity normaly associated to objects. That is so because many values can have the same name whereas the identity of an object is necesseraly unique.

This is similar to the notion of property, attribute, field, instance variables, etc. But it has deeper additional consequences and usages.

Among other usages, Iɴᴏx uses names to access variables in stacks. Most other languages use index insteads, a position in the stack. A position that is most often relative to the level of the stack when some function is entered/activated. These are the classical notions of activation records and local variables associated to function calls.

Because Iɴᴏx access variables by names there is no need to provide a user friendly syntax to figure out the numerical position of a variable in a stack. Hence local variables in Iɴᴏx are dynamically scoped, no lexical scope, not yet.

Iɴᴏx also uses named values to implement control structures (if, loop, etc) without the computation of complex changes to the instruction pointer. It is still possible to manipule that instruction pointer to implements diverses form of branching (goto, jump, call, exceptions, etc) ahead of time, at compile time, when words are defined, but this is more an optimization than a natural way of expressing things using names instead of labels like in the dark age of assembler languages.

An Iɴᴏx optimizing compiler is somewhere is the road map, we'll come to it somedays, just in time.


Hints
-----

Interpreters are slow, this is inevitable to some extend. That disadvange is compensated by some additionnal level of safety. No more dangling pointers, overflow/underflow, off by one back doors, eisenbugs that disappear when observed and all the drama of low level debugging, core dumps, viruses and unanticipated corner cases. Less pain.

Yet, no pain, no gain. If you dare, Iɴᴏx lets you enter adventure land. You then giveup asserts, type checking, boundaries guards and maybe even dynamic memory management in exhange for speed. Up to C speed for those who are willing to take the risk.

Runtime checks are enabled/disabled at user's will, at run time potentially. This provides a speed boost that is well deserved when sufficient test coverage was conducted by the mature programmer using state of art technics.

Type checking at compile time is a mode that sustains the passage of time, it is not going to disappear soon. On the other end of the spectrum, script languages favor late binding and run time type identification. Let's try to unite these opposite preferences.

Syntax is also a matter of taste. Iɴᴏx is rather opiniated about that. To some reasonnable extend it provide mechanisms to alter the syntax of the language, sometimes radically. Thanks Forth for that.

It is up to each programmer to apply the style she prefers, life is brief. There is more than one way to do it as they say in the wonderfull world of Perl. The principle of least surprise is cautious but girls love bad guys, don't they?

So, be surprised, be surprising, get inspirational if you can, endorse the Iɴᴏx spirit!

Vive Iɴᴏx ! Or else, stay calm and carry on, c'est la vie, a tale maybe.


Overview
========

Here is a short presentation of some of the main characteristics of the Iɴᴏx programming language. There is no stable set of features yet but it gives some ideas about the general spirit of the language.

This introduction is more like a tutorial than a reference manual. That will come next, when design gets stable. Enjoy and stay tuned!


Words
=====

``` sh
to hello  "hello" out.

hello
```

This defines a **word** named `hello`. Then the word is invoked and as a result `hello` is displayed on some output device.

Words take their arguments from a the _data stack_. They can also push results onto that stack.

Word `to` starts a word _definition_ that an often optional `.` (dot) terminates. Inside that defintion there are other words and litteral values like numbers or pieces of text.

Note: a _word_ can be made of anything, not just letters. As a result `even?` is a valid name, it could be the name of a word that tests if a number is even. By convention words with a `?` are _predicates_, their result is a _boolean value_ that is either true or false.

``` sh
to say out.
"hello" say
```

As a convenience the word to invoke can be specified before the pushed data, using `( )` paranthesis.

``` sh
say( "hello" )  ~~ "infix" style
"hello" say     ~~ "postfix" style
```

It is the responsabily of whoever invokes a word to first push the arguments required by that word, in the proper order, in the proper number. Each word can define it's own _protocol_ about that.


Control structures
==================

 ``` sh
to play
  random-no( 100 )
  loop: {
    out( "Guess? " )
    read-line, text-to-integer,
    dup, if not integer? then: { drop,               continue }
    dup, if: >?          then: { out( "Too big"   ), continue }
    dup, if: <?          then: { out( "Too small" ), continue }
    out( "Yes!" ), break
  }
  clear-data
```

This code is a small game where the player must guess a number between 0 and 100. It illustrates two important _control structures_: loops and _conditionnals_. `dup` duplicates the value on the top of the data stack whereas `drop` removes it while `clear-data` empties the entire stack.

`while: { ... } do: { ... }` and `do: { ... } until: { ... }` are special versions of the more general `loop: { ... }` structure where the loop breaks or continue depending on some condition.


Functions
=========

Functions are special words with named _parameters_ to access _arguments_ in an easier way than is possible from the data stack.

``` sh
to tell-to/  with /msg /dest  function: {
  out( "Tell " & |msg & "to " & |dest )
}

tell-to/( "Hello", "Alice" )
```


By convention the name of functions terminates with a `/` that means _applied on_. When the function is invoked, it's actual arguments are moved from the _data stack_ to another stack named the _control stack_. In the process these values get renamed so that the names of the actual arguments get's replaced by the names of the formal parameters.

The `{}` enclosed _block_ that defines the function can then access the arguments, using the name of the corresponding formal parameter with a `|` (pipe) prefix. This is the syntax for _local variables_ too.

`&` is an operator that joins two pieces of text found on the data stack.


```
to tell-to/  with /m /d, fn{ out( "T " & |m & "t " && |d }
```

This is an abbreviated syntax that is defined in the _standard library_. `fn{ ... }` is like `fn( ... )` but the former invokes the `fn{` word with the block as sole argument whereas the later invokes the word `f` when `)` is reached, with the arguments on the stack.


Assertions
==========

```
assert{ check-something }
```

Assertions are conditions to expect when things go normally, ie with no bugs. Assertions before something are called _pre conditions_ whereas assertions after something are called _post conditions_. This is usefull to detect bugs early.

Note: the word `assert{` does not evaluate it's block argument when running in _fast_ mode. Hence there is little overhead involved to keep lots of assertions even when the code is ready for production. Who knows, they may prove valuable later on when some maintenance error breaks something. It's like tests, but inline instead of in some independant test suite.

The default definition of `assert{` use the `inox-FATAL` primitive. However it uses it via an indirection by the `FATAL` word so that the behaviour can be redefined freely.


Word redefinition
=================

``` sh
to FATAL  /FATAL-hook call-by-tag.  ~~ late binding
```

This kind of late binding makes it easy to hook some new code to old word definitions. Without those indirections there would be no solution for old words to use redefined words. That's because redefined word definition impact words defined after the redefinition only, the old word keep using the older definition.

``` sh
to FATAL-hook handle-it-my-way.
```

The default implementation in the _standard library_ uses `inox-FATAL`. That primitive displays a stack trace and then forces the exit of the Iɴᴏx process. This is brutal but safe when Iɴᴏx processes are managed by some orchestration layer. A layer that will automatically restart the dead process for example.


Blocks
======

Blocks are sequence of _words_.

``` sh
to tell-sign  if-else( <0?, { out( "negative" ) }, { out( "positive" ) }.

-1 tell-sign  ~~ outputs negative

tell-sign( -1 ) ~~ idem, infix style`
```

Two consecutive `~~` (tildes) introduce a comment that goes until the end of the line. Use `~|` and `|~` for multi lines comments.


Keywords
========

```sh
to say:to:  swap " " prefix prefix out().

say: "Hello" to: "Bob";
```

Keywords are multi parts words with a `:` (colon) after each part and a final `;` (semi colon).

`swap` is a predefined word that swaps the value at the top of the data stack with the next value on that stack. `prefix` is somehow like the `&` operator but it joins the two pieces of text in reverse order so that the second becomes the prefix of the first one on the final text result.

``` sh
to prefix  over join-text  ~~ this is the standard definition, see bootstrap.nox
```

`over` is like `dup` but it duplicate NOS instead of TOS, ie it duplicates the next value on the stack instead of the top of stack value. Juggling with values on the stack gets tricky easely. That's why it is sometimes usefull to describe the _protocol_ of a _word_ with special comment about their _effect_ on the stack.

Here are such comments for the most common words about the data stack:

``` sh
dup    ~| a -- a a |~
drop   ~| x -- |~
swap   ~| a b -- b a |~
over   ~| a b -- a b a |~
```

Back to keywords.

```sh
to tell-sign
  if: <0? then: {
    out( "negative" )
  } else: {
    out( "positive )
  }
```

`if:then:else:` is a keyword. It is predefined. If it were not, it could easly be defined using the `if-else` word.

``` sh
to if:then:else  ~| cond block block -- |~
~~ run first or second block depending on condition
  if-else
```

`if-else` is a word that expects to find three argument on the data stack: a boolean value and two blocks. Depending on the boolean, it runs either the first or the second block.

``` sh
to tell-sign  <0? { "negative" out } { "positive" out } if-else.
```

This definition of the word `tell-sign` uses a style that is unusual, it is a postfix notation. This is compact but sometimes difficult to read. Depending on your preferences you may use either that postfix style, a classical infix function call style or the multi parts keyword style.


Variables
=========

Global variables
----------------

```
variable: /global-state is: "initial state".
constant: /error-state  is: "error".

loop: {
  if: global-state =? error-state then: { break };
  ....
  if: xxx then: { "next" global-state! };
  ...
}


There are automatically two words that are created for each global variable. First word is the _getter_ word, which is simply the name of the variable as specified when the variable was created, using a tag. The second word is the _setter_ word, the same name with the `!` _suffix_.

Constants are like variables but with no _setter_ word. Once set, at creation, the value cannot change anymore.

Note that `constant: /error-state is: "error".` just means `to error-state "error".` Which form you use depends on the style you prefer.


Local variables
---------------

``` sh
to say-to/  fn{ dest| msg|
  out( "Say" & |msg & " to " & |dest
}
```

Local variables are variables stored into another stack, the _control stack_. Syntax `xyz|` creates such variables using the value from the top of the data stack. It reads _"pop the top of the data stack to create the local variable x"_. One uses `|xyz` to retrieve the value of the local variable. It reads _"get local variable x"_.

To set the value of a local variable using the top of the stack, use `|xyz!`. `!` (exclamation point) means "set" in this context and by convention it means _"some side effect or surprise involved"_ is a more general sense.

``fn{`` and `}` specify respectively the begining and the end of the **scope** within which local variables are created and used. These scopes can nest in such a way that a local variable created by a word can be accessed from the other words invoked while the scope exists, unless that word created another local variable with the same name.

This type of scoping for variables is named _"dynamic"_ by opposition to the more frequent static style named _"lexical"_ where a local variable stays purely local to the function that created it. Note: changing the value of a local variable outside the word that created it is usually considered _"harmful"_ and should be avoided.


Object variables
----------------

**Object variables** are stored inside the stack that belongs to an _object_. Every object has an identity and a value that is a stack of values. The name of that stack is the _class_ of the object. The names of the values in the object's stack are the names of the _attributes_ of the object.

Note: the OOP (Object Oriented Programming) literature uses many names for that concept: _fields_, _properties_, _attributes_, _instance variables_, _members_, etc. They all mean the same.

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


Values
======

Values are simple things such as `1`, `"hello"`, `/msg` or the identity of some object, or some more complex values, made of multiple simple values.

Each value, either simple or complex, has a type and a name attached to it. These **named values** are often more convenient to manipulate than the classical anonymous values found in most computer languages.

There are a few special values, including _falsy_ values such as `0`, `void` or `""` (the empty text) that are often usefull when a _boolean_ value is expected.


Falsy values
------------

There is a `boolean` type of value with only two valid values, true and false.


```
if: "" then out( "true" )      ~~ => true
if: "" ? then out( "true" )    ~~ nothing, "" is falsy
if: void then out( "true" )    ~~ => true! only false is false actually
if: void ? then out( "true" )  ~~ nothing, void is falsy
```

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
===================

Every thing is something, hence **thing** is the base class of everything else, both values and objects. Values have a name and a type whereas objects have an identity and a value also made of more or less simple multiple values (object variables), potentially including pointer values when objects references each others. By convention the name of the value of a object is named it's _class_.

```
class( |xxx )  ~~ get the class of the thing in the xxx local variable.
```

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

Note: this usage of the control stack is so frequent that most languages call it _the return stack_ instead.


Stack protocol
--------------

Words agree on protocols to manipule values on the data stack. The most simple, fast and accrobatic protocol is the _stack protocol_. With that protocol it is the order of the arguments on the stack that matters.

```
to fib
  dup
  if: >? 2 then: {
    dup, fib( - 1 ) + fib( swap - 2 )
  }

out( fib( 10 ) )  ~~ outputs the 10th number of the fibonacci suite
```

In this example, `dup` duplicates the TOS (Top Of the Stack) and `swap` swaps it with the NOS (Next On Stack). Dealing this way with the stack can become rather accrobatic and using functions produces a solution that is more readable (but sligthly less fast).


Function protocol
-----------------

This protocol is very common in most programming languages. It states that _functions_ get _parameters_ thanks to _arguments_ that the _caller_ function _provides_ to the called function. That function is then expected to _consume_ these arguments in order to produce one or more results.

```
to fib/  with nth/
~~ Compute the nth number of the Fibonacci suite
  function: {
    if |nth >? 2 then: {
      fib/( |nth - 1 ) + fib/( |nth - 2 )
    } else: {
      |nth
    }
  }
 ```

This definition of the fib word is _recursive_ because it references itself. If the current word were the last word of it's definition, using `again` instead would be a better solution because it avoids a potential overflow of the control stack. This classic optimisation is called _"tail call elimination"_ and it is done by the Iɴᴏx compiler (ToDo).

Unfortunately it does not apply to the fidonacci function because the actual last word of the definition is the `if` word. This is clearly visible in the postfix notation only.

```
to fib
  dup
  2 >? {
    dup,  1, -, fib
    swap, 2, -, fib
    +
  } if
```

Note: the `,` (comma) is purely cosmetic, it is just there to make the source code clear, somehow.


Named parameters protocol
-------------------------

Another style is possible using named values in the data stack.

```
to fib  ~| nth:n ... -- nth:n ... fib:n |~
  ( if: _nth >? 2 then: {
    fib( _nth - 1 :nth ) + fib( _nth - 2 :nth ) )
  } )fib

out( fib( nth:10 ) )  ~~ However the parameter now needs to be named
```

In this example `:nth` _renames_ the TOS (Top Of the Stack). It is necessary to do so because word `fib` uses `_nth` to get it's parameter. That's a different word _protocol_ than the ones of the previous definitions of `fib`, it's the `named parameters` protocol.

Words often name their result. That way, it becomes easy to get theses results later on from the data stack. Syntax `( ... )something` makes it easy to rename a single result.

When a word returns multiple results, it should name each of them to respect the _named protocol_, this is just a convention however.

When the results are no longer need, they can be forgetten, ie removed from the data stack. Syntax `something/forget` does that, it removes all the values from the top of the stack up to the one named `something` included.

Note: The _function protocol_ uses a special version of `forget` that operates on the _control stack_ because parameters and local variables are stored in that stack instead of beeing stored in the _data stack_.


Other stacks
------------

A stack is fairly usefull data structure and it is easy to create one using an array of values whose size grows and shrinks when values are pushed onto the stack and popped from it.

``` sh
make-stack
"hello " _stack.push
"world!" _stack.push
out( _stack.pop & _stack.pop )

~~ it outputs world!hello , out( _stack.pop _stack.pop prefix ) would produces hello world! instead.
```

Note : the result of `make-stack` is a _pointer_ value named `stack`, this is the reason why `_stack` easely finds it inside the data stack.


Method protocol
---------------

*Methods* are word that operate on something, often an object. They do very little but what they do is essential. They figure out the name of a word based on their own name and the _class_ of the value that they find on the stack.

Because the name of final word is determined at run time, not compile time, this is called _late binding_.

Inox is somehow special about that because methods work both with objects and with values. So much that it is fairly easy to implement the value semantic using objects, the user don't see the difference. A few methods needs to be implemented to handle _cloning_ and _value equality_. Cloning is about duplicating a value whereas value equality is about determining if two values are actually the same value even if their object representation is different.

The opposite is true also, it is easy to implement the objet semantic of any value, it just needs to be _boxed_, ie put in some object.

``` sh
to text.box              :box text-box:1 make-object.
to text-box.super-class  /value.
to text-box.push         dup >R ( .box swap & .box! ) R>.
to text-box.value        .box.
to text-box.out          .box out.

"Hello" .box       ~~ make a text-box object
.push( " world" )  ~~ add text to it
.push( " !" )
out( .value() )    ~~ output it's value
```

This is a fairly inefficient version of a `text-box` buffer class but it works. Using it one can add text to the buffer until the result is used to output it using `.out()` or to get it's text value using `.value()`.

A more efficient version may accumulate pieces of text inside a list and then join the members of the list when the text value is eventually needed.

There will exist higher level words to help define such boxed values and much more, in the _standard librairy_. However, whatever the implementation, at the end it will always be about applying method words to objects.

`>R` and `R>` move the TOS forth and back to the _control stack_, this is a simple solution to save something and restore it later. In the example, it is the pointer to the text-box object that is saved and restored. By convention method word that don't provide a result simply provide back the pointer they were provided. That pointer is the _target_ of the method. This is part of the _method protocol_.

Note: the _target_ of a _method_ does not need to be a _pointer_ to an object, it can also be any other type of value. As a result _methods_ are ok for both types of value, builtin type and user defined objects.


Modules
=======

There is no concept of _module_ per see at this point but this will come later. For now the solution is to encapsulate words into some _pseudo class_ and use `some-module.some-word()` to avoid collisions with words named identically in other modules. Alternatively one may use `some-module_some-word` or any other separator like ``some-module::some-word`. Until better.

Note that using `class.some-word()`and `class.some-word` do not produce the same result because the second form only return the word, it does not call it. To call it, use syntax `class.some-word definition call` or shorter `class.some-word call-word`.


Immediate words
===============

To improve speed, use syntax `[ /class.some-word definition ] literal call` as this will compute the address of the word _definition_ at compile time instead of run time, ie _early binding_ instead of _late binding_.

Or, shorter, use `quote class.some-word word-literal`.

``' class.some-word word-literal` is even shorter but less readable, at least until you get used to it.


When defining a word, typically after ``to some-thing`` the Inox interpretor switches to a special _compile mode_. In that mode the following words are added to the _definition_ of word being compiled instead of beeing immediately executed.

However, some words, _immediate words_, also called __defining words_, are still immediately executed. These special words are typically usefull to compute stuff immediately instead of later on when the word is invoked.

Together with `word-literal` and other similar __defining words__, this concept of _compile mode_ versus __run time__ makes it easy to define words using the result of some computation instead of just adding plain word names to the definition.

``literal`` is one such word, it adds a literal to the definition. A _literal_ is something like a number, a piece of text, a tag, etc. Ie, it's a simple value. As usual, the literal to add is found on the top of the stack.

To define an _immediate_ word, simply invoke the `immediate` word right after the normal word definition.

```
variable: /profiling is: true;
to profile increment-call#.
to with-profiling
  if: profiling then: {
    inox-word tag-literal
    /profile  word-literal
  }
immediate

~~ simple profiling, counts numbers of calls, usage:
true profiling!
to do-it with-profiling do-something.
```

Because ``with-profiling`` is an _immediate_ word, it is called when the word ``do-it`` is defined, at _compile time_, not when it is called, not at _run time_.

It then gets the name of the current word, which is `/do-it`,using ``ìnox-word``, and then add some code to the definition of that current word.

Said code will call ``profile`` with the name of the word as parameter. That `profile` word would typically increment some counter associated with the word, this is not shown in the example.

If _global variable_ `profiling` is false, nothing happens, ie no profiling code is added.

Reminder: ``variable: xxx is: yyy;`` creates a _global variable_ with some initial value. It is the possible to get and set the value of that variable. Using `xxx` to get it and `xxx!` to change it.

```
to global-state   "initial-state".
to global-state!  [ /initial-state definition literal ] @!.
```

This example is a tricky way to do what `variable:is:` does safely. It gets the address of the definition of the global-state word and changes it so that it provides a new value. ``@!```is a super powerfull word that can change any value anywhere you of, ie with the proper _address_. It's not a _safe_ word, use it at your own risk.

Note: changing the definition of a word this ways is a kind of _self modifying code_. This can be convenient sometimes, rarely, for optimizations typically. Remember the advice: avoid premature optimization. First make it work, then you can make it better.


Dialects
========

Iɴᴏx was designed to be extensible. It supports multiple dialects in addition to it's own dialect. The Forth language was a primary source of inspiration. This is why a Forth dialect is proposed.

``` sh
forth-dialect ( speaks Forth )  : HELLO ." Hello" ; HELLO

inox-dialect ~| speaks Iɴᴏx |~  to Hello  out( "Hello" ). Hello
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

Whereas a passive objects execute locally a word definition when told to do so and suspend the invoker until done, active objects run words in parallel. Sometimes it is inside the same machine, either a virtual Iɴᴏx machine or a physical machine. Sometimes it is inside distant machines, with messages transmitted over a network.

Actors are necessary for distributed computing and usefull for asynchronous programming. They are utilized for both purposes often. Actors receive messages from a queue, their _data stack_, and send messages to other actors that they know about either because they created them or because they knew about them by querying some registry.

Like objects, actors have an identity, a class and variables that define their
_state_. However each actor runs in a different thread of execution. Using objects you play solo, with actors it's an orchestra!


Orchestration
=============

The grand plan is to built an orchestration solution on top of Iɴᴏx defined actors. Such a control plane would automaticcaly restart failing actors, allocate ressources wisely, control hot reloads and migrations, etc.

This is not at all available yet. Please don't use Iɴᴏx in production.


Conclusion
==========

None yet. _That's all folk!_

BTW: there are many bugs in the sample code, can you spot them?
