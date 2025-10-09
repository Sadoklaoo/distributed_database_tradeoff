# controller/app/utils.py
from bson import ObjectId, Decimal128, DBRef, Timestamp, Binary
from datetime import datetime
from bson.regex import Regex
from bson.code import Code

def bson_to_json_compatible(obj):
    """
    Recursively converts BSON objects to JSON-serializable Python types.
    """
    if isinstance(obj, dict):
        return {k: bson_to_json_compatible(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [bson_to_json_compatible(i) for i in obj]
    elif isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, Timestamp):
        return {"t": obj.time, "i": obj.inc}
    elif isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, Decimal128):
        return str(obj)
    elif isinstance(obj, Binary):
        return obj.hex()
    elif isinstance(obj, bytes):
        return obj.decode(errors="replace")
    elif isinstance(obj, DBRef):
        return {"$ref": obj.collection, "$id": str(obj.id)}
    elif isinstance(obj, Regex):
        return str(obj)
    elif isinstance(obj, Code):
        return str(obj)
    else:
        return str(obj)  # fallback for any unknown type
