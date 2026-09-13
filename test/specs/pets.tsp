import "@typespec/http";

using Http;

@service(#{ title: "Pets" })
namespace Pets;

model Pet {
  @minValue(1) id: int32;
  name: string;
  children?: Pet[];
}

@route("/pets")
interface PetsApi {
  @get list(@query limit?: int32): Pet[];
  @get read(@path petId: int32): Pet;
  @post create(@body body: Pet): {
    @statusCode _: 201;
    @body pet: Pet;
  };
}
