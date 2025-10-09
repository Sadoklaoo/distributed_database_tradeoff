from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError

class MongoDBClient:
    def __init__(self, uri: str, db_name: str):
        self.uri = uri
        self.db_name = db_name
        self.client = None
        self.db = None

    async def connect(self):
        if not self.client:
            self.client = AsyncIOMotorClient(self.uri)
            self.db = self.client[self.db_name]

    def close(self):
        if self.client:
            self.client.close()

    # ---------------------------
    # Ping & Replica Set
    # ---------------------------
    async def ping(self):
        await self.connect()
        return await self.db.command("ping")

    async def replset_status(self):
        await self.connect()
        return await self.client.admin.command("replSetGetStatus")

    # ---------------------------
    # CRUD
    # ---------------------------
    async def insert_document(self, collection: str, document: dict):
        """Inserts a document with structure {collection, document: {...}}"""
        await self.connect()
        try:
            data = {"collection": collection, "document": document}
            result = await self.db[collection].insert_one(data)
            return str(result.inserted_id)
        except PyMongoError as e:
            raise e

    async def find_documents(self, collection: str, query: dict = None):
        """Finds documents by matching on fields inside the nested 'document'."""
        await self.connect()
        try:
            query = query or {}
            # Convert query to search inside "document"
            nested_query = {f"document.{k}": v for k, v in query.items()}
            cursor = self.db[collection].find(nested_query)
            results = []
            async for doc in cursor:
                results.append(doc)
            return results
        except PyMongoError as e:
            raise e

    async def update_document(self, collection: str, filter_query: dict, update_query: dict):
        """Updates nested 'document' fields."""
        await self.connect()
        try:
            nested_filter = {f"document.{k}": v for k, v in filter_query.items()}
            nested_update = {f"document.{k}": v for k, v in update_query.items()}

            result = await self.db[collection].update_many(nested_filter, {"$set": nested_update})
            return {
                "matched_count": result.matched_count,
                "modified_count": result.modified_count,
                "acknowledged": bool(result.acknowledged) 
            }
        except PyMongoError as e:
            raise e

    async def delete_document(self, collection: str, filter_query: dict):
        """Deletes documents by matching on nested 'document' fields."""
        await self.connect()
        try:
            nested_filter = {f"document.{k}": v for k, v in filter_query.items()}
            result = await self.db[collection].delete_many(nested_filter)
            return {"deleted_count": result.deleted_count,"acknowledged": bool(result.acknowledged)}
        except PyMongoError as e:
            raise e
