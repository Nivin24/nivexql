from sqlalchemy import create_engine
from sqlalchemy.engine import URL

url = URL.create(drivername="postgresql", username="user", password=None, host="localhost", port=5432, database="postgres")
print("Original:", url)
new_url = url.set(database="template1")
print("New:", new_url)

try:
    engine = create_engine(new_url)
    with engine.connect() as conn:
        print("Connected!")
except Exception as e:
    print("Error:", e)
