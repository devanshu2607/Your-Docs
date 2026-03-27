from pydantic import BaseModel , Field
from typing import Annotated
from uuid import UUID

class Create_Docs(BaseModel):
    title : Annotated[str , Field(..., description="enter the title of Docs")]
    content : Annotated[str , Field(..., description="enter the content you want to enter in your docs")]

class View_Docs(BaseModel):
    id : UUID
    title : str 
    content : str

    class Config:
        from_attributes = True 
