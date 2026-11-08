;; An async-lowered host import returns a `char`, which is lowered into guest
;; memory as its code point. The export returns that code point as a `u32`, so
;; the test sees exactly what was written.
(component
  (import "get-char" (func $get-char async (result char)))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $get-char (canon lower (func $get-char) async (memory (core memory $libc "mem"))))
  (core func $wset-new (canon waitable-set.new))
  (core func $join (canon waitable.join))
  (core func $subtask-drop (canon subtask.drop))
  (core func $task-return (canon task.return (result u32)))

  (core module $m
    (import "" "mem" (memory 1))
    (import "" "get-char" (func $get-char (param i32) (result i32)))
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable.join" (func $join (param i32 i32)))
    (import "" "subtask.drop" (func $subtask-drop (param i32)))
    (import "" "task.return" (func $task-return (param i32)))

    (global $set (mut i32) (i32.const 0))

    (func (export "run") (result i32)
      (local $status i32)
      ;; Not a code point: shows if nothing was written.
      (i32.store (i32.const 16) (i32.const 0xffffffff))
      (local.set $status (call $get-char (i32.const 16)))
      (if (i32.eq (i32.and (local.get $status) (i32.const 0xf)) (i32.const 2 (; RETURNED ;)))
        (then
          (call $task-return (i32.load (i32.const 16)))
          (return (i32.const 0 (; EXIT ;)))))
      (global.set $set (call $wset-new))
      (call $join (i32.shr_u (local.get $status) (i32.const 4)) (global.get $set))
      (i32.or (i32.const 2 (; WAIT ;)) (i32.shl (global.get $set) (i32.const 4))))

    (func (export "callback") (param $event i32) (param $subtask i32) (param $status i32) (result i32)
      (if (i32.ne (local.get $event) (i32.const 1 (; SUBTASK ;)))
        (then unreachable))
      (if (i32.ne (local.get $status) (i32.const 2 (; RETURNED ;)))
        (then (return (i32.or (i32.const 2 (; WAIT ;)) (i32.shl (global.get $set) (i32.const 4))))))
      (call $subtask-drop (local.get $subtask))
      (call $task-return (i32.load (i32.const 16)))
      (i32.const 0 (; EXIT ;)))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "mem" (memory $libc "mem"))
        (export "get-char" (func $get-char))
        (export "waitable-set.new" (func $wset-new))
        (export "waitable.join" (func $join))
        (export "subtask.drop" (func $subtask-drop))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "run") async (result u32)
    (canon lift (core func $i "run") async (callback (core func $i "callback"))
      (memory (core memory $libc "mem"))))
)
