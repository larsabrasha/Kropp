using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kropp.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateSequence(
                name: "sync_seq");

            migrationBuilder.CreateTable(
                name: "SyncDocuments",
                columns: table => new
                {
                    Type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ModifiedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    Data = table.Column<string>(type: "jsonb", nullable: true),
                    ServerSeq = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncDocuments", x => new { x.Type, x.Id });
                });

            migrationBuilder.CreateIndex(
                name: "IX_SyncDocuments_ServerSeq",
                table: "SyncDocuments",
                column: "ServerSeq",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SyncDocuments");

            migrationBuilder.DropSequence(
                name: "sync_seq");
        }
    }
}
