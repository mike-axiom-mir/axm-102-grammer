'use strict';

// Original runtime source; no third-party modules, file access or network use.
module.exports = String.raw`import math as _axm_math
import builtins as _axm_b


def _axm_error(code):
    raise _axm_b.ValueError(code)


def _axm_tick(ctx):
    ctx[0] -= 1
    if ctx[0] < 0:
        _axm_error("STEP_LIMIT")


def _axm_step(ctx, value):
    _axm_tick(ctx)
    if _axm_b.type(value) in (_axm_b.int, _axm_b.float):
        if _axm_b.abs(value) > 9007199254740991 or not _axm_math.isfinite(value):
            _axm_error("NUMBER_RANGE")
        return 0 if value == 0 else value
    if _axm_b.type(value) is _axm_b.str:
        ctx[0] -= _axm_b.len(value)
        if ctx[0] < 0:
            _axm_error("STEP_LIMIT")
        if _axm_b.len(value) > 16384:
            _axm_error("STRING_LIMIT")
        if _axm_b.any(0xD800 <= _axm_b.ord(ch) <= 0xDFFF for ch in value):
            _axm_error("UNICODE_SURROGATE")
    if _axm_b.type(value) is _axm_b.list:
        if _axm_b.len(value) > 4096:
            _axm_error("LIST_LIMIT")
        ctx[0] -= _axm_b.len(value)
        if ctx[0] < 0:
            _axm_error("STEP_LIMIT")
    return value


def _axm_check(ctx, value, wanted, depth=0):
    _axm_step(ctx, value)
    if depth > 48:
        _axm_error("VALUE_DEPTH_LIMIT")
    if wanted == "null":
        if value is not None:
            _axm_error("VALUE_TYPE")
        return
    if _axm_b.type(wanted) is _axm_b.str:
        valid = (_axm_b.type(value) in (_axm_b.int, _axm_b.float) if wanted == "number" else
                 _axm_b.type(value) is _axm_b.str if wanted == "string" else _axm_b.type(value) is bool)
        if not valid:
            _axm_error("VALUE_TYPE")
        return
    if "nullable" in wanted:
        if value is not None:
            _axm_check(ctx, value, wanted["nullable"], depth + 1)
        return
    if "list" in wanted:
        if _axm_b.type(value) is not _axm_b.list:
            _axm_error("VALUE_TYPE")
        for item in value:
            _axm_check(ctx, item, wanted["list"], depth + 1)
        return
    if _axm_b.type(value) is not _axm_b.dict or _axm_b.set(value) != _axm_b.set(wanted["record"]):
        _axm_error("VALUE_TYPE")
    for key in _axm_b.sorted(wanted["record"]):
        _axm_check(ctx, value[key], wanted["record"][key], depth + 1)


def _axm_literal(ctx, value, wanted):
    _axm_check(ctx, value, wanted)
    return value


def _axm_entry(fn, args, types, result_type):
    if _axm_b.len(args) != _axm_b.len(types):
        _axm_error("ARGUMENT_COUNT")
    ctx = [100000]
    for arg, wanted in _axm_b.zip(args, types):
        _axm_check(ctx, arg, wanted)
    value = fn(ctx, *args)
    _axm_check(ctx, value, result_type)
    return value


def _axm_index(value):
    if value < 0 or value != _axm_math.floor(value):
        _axm_error("INDEX_INVALID")
    return _axm_b.int(value)


def _axm_div(left, right):
    if right == 0:
        _axm_error("DIVISION_BY_ZERO")
    return _axm_b.float(left) / _axm_b.float(right)


def _axm_rem(left, right):
    if right == 0:
        _axm_error("DIVISION_BY_ZERO")
    return _axm_math.fmod(left, right)


def _axm_equal(ctx, left, right):
    _axm_tick(ctx)
    if _axm_b.type(left) is _axm_b.list and _axm_b.type(right) is _axm_b.list:
        return _axm_b.len(left) == _axm_b.len(right) and _axm_b.all(_axm_equal(ctx, a, b) for a, b in _axm_b.zip(left, right))
    if _axm_b.type(left) is _axm_b.dict and _axm_b.type(right) is _axm_b.dict:
        return _axm_b.set(left) == _axm_b.set(right) and _axm_b.all(_axm_equal(ctx, left[k], right[k]) for k in _axm_b.sorted(left))
    return left == right


def _axm_seq(ctx, kind, values, fn):
    output = []
    for item in values:
        _axm_tick(ctx)
        value = fn(item)
        if kind == "map":
            output.append(value)
        elif kind == "filter" and value:
            output.append(item)
        elif kind == "some" and value:
            return True
        elif kind == "every" and not value:
            return False
    return False if kind == "some" else True if kind == "every" else output


def _axm_fold(ctx, values, initial, fn):
    value = initial
    for item in values:
        _axm_tick(ctx)
        value = fn(value, item)
    return value


def _axm_sort(ctx, values, fn, descending):
    # Decorate exactly once. Python and ECMAScript both specify stable sorting.
    decorated = []
    for value in values:
        _axm_tick(ctx)
        decorated.append((fn(value), value))
    # Charge a conservative shared bound instead of a runtime-specific comparator count.
    for unused in _axm_b.range(_axm_b.len(values) * _axm_b.max(1, _axm_b.len(values).bit_length())):
        _axm_tick(ctx)
    return [pair[1] for pair in _axm_b.sorted(decorated, key=lambda pair: pair[0], reverse=descending)]


def _axm_at(values, index, fallback):
    index = _axm_index(index)
    return values[index] if index < _axm_b.len(values) else fallback()


def _axm_slice(value, start, end):
    return value[_axm_index(start):_axm_index(end)]


def _axm_join(values, separator):
    return separator.join(values)


def _axm_contains(left, right):
    return right in left


def _axm_split(value, separator):
    if not separator:
        _axm_error("EMPTY_SEPARATOR")
    return value.split(separator)


def _axm_trim(value):
    return value.strip(" \t\r\n\v\f")


def _axm_lower(value):
    return "".join(_axm_b.chr(_axm_b.ord(ch) + 32) if "A" <= ch <= "Z" else ch for ch in value)


def _axm_upper(value):
    return "".join(_axm_b.chr(_axm_b.ord(ch) - 32) if "a" <= ch <= "z" else ch for ch in value)


def _axm_coalesce(value, fallback):
    return fallback() if value is None else value
`;
