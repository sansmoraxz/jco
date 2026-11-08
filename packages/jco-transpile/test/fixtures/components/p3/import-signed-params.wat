;; Passes `s8` and `s16` arguments to host imports as core i32 values whose bits
;; above the type's width are zeroes, ones or anything else. The Canonical ABI
;; ignores those bits (`lift_flat_signed`), so the host sees the same five pairs
;; through the sync-lowered `take` and the async-lowered `take-async`.
(component
  (import "take" (func $take (param "a" s8) (param "b" s16)))
  (import "take-async" (func $take-async async (param "a" s8) (param "b" s16)))

  (core module $libc (memory (export "mem") 1))
  (core instance $libc (instantiate $libc))

  (core func $take (canon lower (func $take)))
  (core func $take-async (canon lower (func $take-async) async (memory (core memory $libc "mem"))))
  (core func $wset-new (canon waitable-set.new))
  (core func $join (canon waitable.join))
  (core func $subtask-drop (canon subtask.drop))
  (core func $task-return (canon task.return))

  (core module $m
    (import "" "take" (func $take (param i32 i32)))
    (import "" "take-async" (func $take-async (param i32 i32) (result i32)))
    (import "" "waitable-set.new" (func $wset-new (result i32)))
    (import "" "waitable.join" (func $join (param i32 i32)))
    (import "" "subtask.drop" (func $subtask-drop (param i32)))
    (import "" "task.return" (func $task-return))

    (global $set (mut i32) (i32.const 0))
    (global $pending (mut i32) (i32.const 0))

    (func (export "run") (result i32)
      (call $take (i32.const 0xff) (i32.const 0xffff))
      (call $take (i32.const 0x80) (i32.const 0x8000))
      (call $take (i32.const 0x7f) (i32.const 0x7fff))
      (call $take (i32.const 0xffffffff) (i32.const 0xffffffff))
      (call $take (i32.const 0x12345680) (i32.const 0x12348000))
      (call $task-return)
      (i32.const 0 (; EXIT ;)))

    (func $call-async (param $a i32) (param $b i32)
      (local $status i32)
      (local.set $status (call $take-async (local.get $a) (local.get $b)))
      (if (i32.eq (i32.and (local.get $status) (i32.const 0xf)) (i32.const 2 (; RETURNED ;)))
        (then (return)))
      (call $join (i32.shr_u (local.get $status) (i32.const 4)) (global.get $set))
      (global.set $pending (i32.add (global.get $pending) (i32.const 1))))

    (func (export "run-async") (result i32)
      (global.set $set (call $wset-new))
      (call $call-async (i32.const 0xff) (i32.const 0xffff))
      (call $call-async (i32.const 0x80) (i32.const 0x8000))
      (call $call-async (i32.const 0x7f) (i32.const 0x7fff))
      (call $call-async (i32.const 0xffffffff) (i32.const 0xffffffff))
      (call $call-async (i32.const 0x12345680) (i32.const 0x12348000))
      (call $settle))

    ;; Returns once no call is pending, or waits for the next one to.
    (func $settle (result i32)
      (if (global.get $pending)
        (then (return (i32.or (i32.const 2 (; WAIT ;)) (i32.shl (global.get $set) (i32.const 4))))))
      (call $task-return)
      (i32.const 0 (; EXIT ;)))

    (func (export "callback") (param $event i32) (param $subtask i32) (param $status i32) (result i32)
      (if (i32.ne (local.get $event) (i32.const 1 (; SUBTASK ;)))
        (then unreachable))
      (if (i32.eq (local.get $status) (i32.const 2 (; RETURNED ;)))
        (then
          (call $subtask-drop (local.get $subtask))
          (global.set $pending (i32.sub (global.get $pending) (i32.const 1)))))
      (call $settle))
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "take" (func $take))
        (export "take-async" (func $take-async))
        (export "waitable-set.new" (func $wset-new))
        (export "waitable.join" (func $join))
        (export "subtask.drop" (func $subtask-drop))
        (export "task.return" (func $task-return))
      ))
    )
  )

  (func (export "run") async
    (canon lift (core func $i "run") async (callback (core func $i "callback"))))
  (func (export "run-async") async
    (canon lift (core func $i "run-async") async (callback (core func $i "callback"))))
)
