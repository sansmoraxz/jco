;; Async exports hand the core i32 they are given to `task.return` as an `s8`,
;; `u8`, `s16` or `u16` result, which lifts it from a flat parameter, or as the
;; discriminant and payload of an `option<u8>`.
(component
  (core func $return-s8 (canon task.return (result s8)))
  (core func $return-u8 (canon task.return (result u8)))
  (core func $return-s16 (canon task.return (result s16)))
  (core func $return-u16 (canon task.return (result u16)))
  (core func $return-option-u8 (canon task.return (result (option u8))))

  (core module $m
    (import "" "return-s8" (func $return-s8 (param i32)))
    (import "" "return-u8" (func $return-u8 (param i32)))
    (import "" "return-s16" (func $return-s16 (param i32)))
    (import "" "return-u16" (func $return-u16 (param i32)))
    (import "" "return-option-u8" (func $return-option-u8 (param i32 i32)))

    (func (export "s8-of") (param $bits i32) (result i32)
      (call $return-s8 (local.get $bits))
      (i32.const 0 (; EXIT ;)))
    (func (export "u8-of") (param $bits i32) (result i32)
      (call $return-u8 (local.get $bits))
      (i32.const 0 (; EXIT ;)))
    (func (export "s16-of") (param $bits i32) (result i32)
      (call $return-s16 (local.get $bits))
      (i32.const 0 (; EXIT ;)))
    (func (export "u16-of") (param $bits i32) (result i32)
      (call $return-u16 (local.get $bits))
      (i32.const 0 (; EXIT ;)))

    (func (export "option-u8-of") (param $discriminant i32) (param $bits i32) (result i32)
      (call $return-option-u8 (local.get $discriminant) (local.get $bits))
      (i32.const 0 (; EXIT ;)))

    (func (export "callback") (param i32 i32 i32) (result i32)
      unreachable)
  )

  (core instance $i
    (instantiate $m
      (with "" (instance
        (export "return-s8" (func $return-s8))
        (export "return-u8" (func $return-u8))
        (export "return-s16" (func $return-s16))
        (export "return-u16" (func $return-u16))
        (export "return-option-u8" (func $return-option-u8))
      ))
    )
  )

  (func (export "s8-of") async (param "bits" u32) (result s8)
    (canon lift (core func $i "s8-of") async (callback (core func $i "callback"))))
  (func (export "u8-of") async (param "bits" u32) (result u8)
    (canon lift (core func $i "u8-of") async (callback (core func $i "callback"))))
  (func (export "s16-of") async (param "bits" u32) (result s16)
    (canon lift (core func $i "s16-of") async (callback (core func $i "callback"))))
  (func (export "u16-of") async (param "bits" u32) (result u16)
    (canon lift (core func $i "u16-of") async (callback (core func $i "callback"))))
  (func (export "option-u8-of") async (param "discriminant" u32) (param "bits" u32) (result (option u8))
    (canon lift (core func $i "option-u8-of") async (callback (core func $i "callback"))))
)
