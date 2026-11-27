from alembic import context
from app.config import settings
from app.models import Base
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

engine = create_engine(
    make_url(settings.migration_database_url or settings.database_url).set(
        drivername="postgresql+psycopg"
    ),
    hide_parameters=True,
    connect_args={
        "connect_timeout": 10,
        "options": "-c lock_timeout=5000 -c statement_timeout=60000",
    },
)

if context.is_offline_mode():
    context.configure(
        url=engine.url,
        target_metadata=Base.metadata,
        literal_binds=True,
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    with engine.connect() as connection:
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS retail"))
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            include_schemas=True,
            version_table_schema="retail",
        )
        with context.begin_transaction():
            context.run_migrations()
