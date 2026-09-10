from sqlalchemy import Column, String, Text
from app.db.session import Base

class AppSetting(Base):
    __tablename__ = 'app_settings'

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False, default='')
